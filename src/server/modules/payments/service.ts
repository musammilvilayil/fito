import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import { addDays, financialYear, type ISODate } from "@/shared/dates";
import type { PaymentListQuery, PaymentMethod, recordPaymentSchema, refundSchema } from "@/shared/schemas/billing";
import { requirePermission, type GymContext } from "../../auth/context";
import { gymStaff, gyms, members, memberships, payments } from "../../db/schema";
import type { Tx } from "../../db/tx";
import { badRequest, conflict, forbidden, notFound } from "../../errors";
import { audit } from "../audit";
import { nextCounter } from "../counters";
import { getMember, gymToday } from "../members/service";

/** UTC instant for a wall-clock time on a date in the gym's time zone. */
export function zonedTime(date: ISODate, time: string, timeZone: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asLocal = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess.getTime() - (asLocal - guess.getTime()));
}

async function nextReceiptNumber(tx: Tx, ctx: GymContext, date: ISODate) {
  const fy = financialYear(date);
  const n = await nextCounter(tx, ctx.gym.id, `receipt:${fy}`);
  return `${ctx.gym.receiptPrefix}/${fy}/${String(n).padStart(4, "0")}`;
}

async function membershipBalance(tx: Tx, ctx: GymContext, membershipId: string) {
  const result = await tx.execute(sql`
    select m.id, m.member_id, m.total_paise, m.state,
      coalesce((select sum(case when p.kind = 'payment' then p.amount_paise else -p.amount_paise end)
                from payments p where p.membership_id = m.id and p.status = 'completed'), 0)::bigint as paid
    from memberships m where m.id = ${membershipId} and m.gym_id = ${ctx.gym.id}`);
  const r = result.rows[0] as { id: string; member_id: string; total_paise: string; state: string; paid: string } | undefined;
  if (!r) throw notFound("Membership not found.");
  return { memberId: r.member_id, total: Number(r.total_paise), paid: Number(r.paid), state: r.state };
}

/** Inserts a completed payment with the next receipt number. Callers check permissions. */
export async function insertPayment(
  tx: Tx,
  ctx: GymContext,
  p: {
    memberId: string;
    membershipId: string;
    amountPaise: number;
    method: PaymentMethod;
    reference: string | null;
    notes: string | null;
    paidOn: ISODate | null;
  },
) {
  const today = gymToday(ctx);
  const paidOn = p.paidOn ?? today;
  if (paidOn > today) throw badRequest("Payment date can't be in the future.", { fieldErrors: { paidOn: "Future date" } });
  const paidAt = paidOn === today ? new Date() : zonedTime(paidOn, "12:00", ctx.gym.timezone);
  const [row] = await tx
    .insert(payments)
    .values({
      gymId: ctx.gym.id,
      memberId: p.memberId,
      membershipId: p.membershipId,
      kind: "payment",
      amountPaise: p.amountPaise,
      method: p.method,
      status: "completed",
      paidAt,
      reference: p.reference,
      notes: p.notes,
      receiptNumber: await nextReceiptNumber(tx, ctx, paidOn),
      recordedByUserId: ctx.user.id,
    })
    .returning();
  await audit(tx, ctx, "payment.record", "payment", row!.id, { amount: p.amountPaise, method: p.method });
  return row!;
}

export async function recordPayment(tx: Tx, ctx: GymContext, input: z.output<typeof recordPaymentSchema>) {
  requirePermission(ctx, "payments.record");
  await getMember(tx, ctx, input.memberId);
  const bal = await membershipBalance(tx, ctx, input.membershipId);
  if (bal.memberId !== input.memberId) throw badRequest("That membership belongs to another member.");
  if (bal.state === "cancelled") throw badRequest("This membership is cancelled.");
  const due = bal.total - bal.paid;
  if (due <= 0) throw conflict("This membership is already fully paid.");
  if (input.amount <= 0) throw badRequest("Enter an amount.", { fieldErrors: { amount: "Enter an amount" } });
  if (input.amount > due) {
    throw badRequest(`Only ₹${(due / 100).toLocaleString("en-IN")} is due on this membership.`, {
      fieldErrors: { amount: "More than the amount due" },
    });
  }
  return insertPayment(tx, ctx, {
    memberId: input.memberId,
    membershipId: input.membershipId,
    amountPaise: input.amount,
    method: input.method,
    reference: input.reference,
    notes: input.notes,
    paidOn: input.paidOn,
  });
}

async function getPayment(tx: Tx, ctx: GymContext, paymentId: string) {
  const [p] = await tx.select().from(payments).where(and(eq(payments.id, paymentId), eq(payments.gymId, ctx.gym.id)));
  if (!p) throw notFound("Payment not found.");
  return p;
}

async function refundedSoFar(tx: Tx, ctx: GymContext, paymentId: string) {
  const [r] = await tx
    .select({ n: sql<string>`coalesce(sum(${payments.amountPaise}), 0)` })
    .from(payments)
    .where(and(eq(payments.gymId, ctx.gym.id), eq(payments.refundOfId, paymentId), eq(payments.status, "completed")));
  return Number(r?.n ?? 0);
}

/** Records money returned to a member. The original payment stays on record. */
export async function refundPayment(tx: Tx, ctx: GymContext, paymentId: string, input: z.output<typeof refundSchema>) {
  requirePermission(ctx, "payments.void");
  const original = await getPayment(tx, ctx, paymentId);
  if (original.kind !== "payment" || original.status !== "completed") throw badRequest("Only completed payments can be refunded.");
  const refundable = original.amountPaise - (await refundedSoFar(tx, ctx, paymentId));
  if (input.amount <= 0 || input.amount > refundable) {
    throw badRequest(`You can refund up to ₹${(refundable / 100).toLocaleString("en-IN")}.`, { fieldErrors: { amount: "Too much" } });
  }
  const today = gymToday(ctx);
  const [row] = await tx
    .insert(payments)
    .values({
      gymId: ctx.gym.id,
      memberId: original.memberId,
      membershipId: original.membershipId,
      refundOfId: original.id,
      kind: "refund",
      amountPaise: input.amount,
      method: input.method,
      status: "completed",
      notes: input.reason,
      receiptNumber: await nextReceiptNumber(tx, ctx, today),
      recordedByUserId: ctx.user.id,
    })
    .returning();
  await audit(tx, ctx, "payment.refund", "payment", row!.id, { of: paymentId, amount: input.amount, reason: input.reason });
  return row!;
}

/** Marks a payment entered by mistake as void (it no longer counts anywhere). */
export async function voidPayment(tx: Tx, ctx: GymContext, paymentId: string, reason: string) {
  requirePermission(ctx, "payments.void");
  const p = await getPayment(tx, ctx, paymentId);
  if (p.status !== "completed") throw conflict("This payment is already void.");
  if (p.kind === "payment" && (await refundedSoFar(tx, ctx, paymentId)) > 0) {
    throw conflict("This payment has refunds. Void the refunds first.");
  }
  await tx
    .update(payments)
    .set({ status: "void", voidReason: reason, voidedAt: new Date(), voidedByUserId: ctx.user.id })
    .where(eq(payments.id, p.id));
  await audit(tx, ctx, "payment.void", "payment", p.id, { reason });
}

const localDate = (tz: string) => sql`(${payments.paidAt} at time zone ${tz})::date`;

export async function listPayments(tx: Tx, ctx: GymContext, query: PaymentListQuery) {
  requirePermission(ctx, "payments.view");
  const today = gymToday(ctx);
  const from = query.from ?? `${today.slice(0, 8)}01`;
  const to = query.to ?? today;
  if (to < from) throw badRequest("The end date is before the start date.");
  const tz = ctx.gym.timezone;
  const where = and(
    eq(payments.gymId, ctx.gym.id),
    sql`${localDate(tz)} between ${from}::date and ${to}::date`,
    query.method ? eq(payments.method, query.method) : sql`true`,
  );

  const items = await tx
    .select({
      id: payments.id,
      kind: payments.kind,
      amountPaise: payments.amountPaise,
      method: payments.method,
      status: payments.status,
      paidAt: payments.paidAt,
      receiptNumber: payments.receiptNumber,
      reference: payments.reference,
      notes: payments.notes,
      memberId: payments.memberId,
      memberName: members.fullName,
      memberCode: members.memberCode,
      planName: memberships.planName,
      recordedBy: gymStaff.fullName,
    })
    .from(payments)
    .innerJoin(members, eq(members.id, payments.memberId))
    .leftJoin(memberships, eq(memberships.id, payments.membershipId))
    // Staff names come from gym_staff: user rows are private to each user (RLS).
    .leftJoin(gymStaff, and(eq(gymStaff.userId, payments.recordedByUserId), eq(gymStaff.gymId, payments.gymId)))
    .where(where)
    .orderBy(desc(payments.paidAt))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  const totalsRows = await tx
    .select({
      method: payments.method,
      kind: payments.kind,
      amount: sql<string>`sum(${payments.amountPaise})`,
      count: sql<number>`count(*)::int`,
    })
    .from(payments)
    .where(and(where, eq(payments.status, "completed")))
    .groupBy(payments.method, payments.kind);
  const [{ count } = { count: 0 }] = await tx.select({ count: sql<number>`count(*)::int` }).from(payments).where(where);

  const byMethod: Partial<Record<PaymentMethod, number>> = {};
  let collected = 0;
  let refunded = 0;
  for (const t of totalsRows) {
    const amount = Number(t.amount);
    if (t.kind === "payment") {
      collected += amount;
      byMethod[t.method] = (byMethod[t.method] ?? 0) + amount;
    } else {
      refunded += amount;
      byMethod[t.method] = (byMethod[t.method] ?? 0) - amount;
    }
  }
  return { from, to, items, total: count, page: query.page, pageSize: query.pageSize, collected, refunded, net: collected - refunded, byMethod };
}

/** Collections for today and this month, plus total outstanding dues. */
export async function paymentSummary(tx: Tx, ctx: GymContext) {
  requirePermission(ctx, "payments.view");
  const today = gymToday(ctx);
  const monthStart = `${today.slice(0, 8)}01`;
  const tz = ctx.gym.timezone;
  const net = sql<string>`coalesce(sum(case when ${payments.kind} = 'payment' then ${payments.amountPaise} else -${payments.amountPaise} end), 0)`;
  const [row] = await tx
    .select({
      today: sql<string>`coalesce(sum(case when ${localDate(tz)} = ${today}::date then (case when ${payments.kind} = 'payment' then ${payments.amountPaise} else -${payments.amountPaise} end) end), 0)`,
      month: net,
      todayCount: sql<number>`count(*) filter (where ${localDate(tz)} = ${today}::date and ${payments.kind} = 'payment')::int`,
    })
    .from(payments)
    .where(and(eq(payments.gymId, ctx.gym.id), eq(payments.status, "completed"), sql`${localDate(tz)} between ${monthStart}::date and ${today}::date`));
  const dues = await duesTotal(tx, ctx);
  return { today: Number(row?.today ?? 0), todayCount: row?.todayCount ?? 0, month: Number(row?.month ?? 0), ...dues };
}

const duesSql = (gymId: string) => sql`
  select m.id as member_id, m.full_name, m.member_code, m.phone,
    sum(ms.total_paise - coalesce(p.paid, 0))::bigint as due, min(ms.start_date) as oldest
  from memberships ms
  join members m on m.id = ms.member_id
  left join lateral (
    select sum(case when kind = 'payment' then amount_paise else -amount_paise end) as paid
    from payments where membership_id = ms.id and status = 'completed'
  ) p on true
  where ms.gym_id = ${gymId} and ms.state = 'active' and ms.total_paise > coalesce(p.paid, 0)
  group by m.id, m.full_name, m.member_code, m.phone`;

export async function duesTotal(tx: Tx, ctx: GymContext) {
  const result = await tx.execute(sql`select coalesce(sum(due), 0)::bigint as total, count(*)::int as members from (${duesSql(ctx.gym.id)}) d`);
  const r = result.rows[0] as { total: string; members: number };
  return { outstanding: Number(r.total), membersWithDues: r.members };
}

export async function listDues(tx: Tx, ctx: GymContext) {
  requirePermission(ctx, "payments.view");
  const result = await tx.execute(sql`${duesSql(ctx.gym.id)} order by due desc limit 200`);
  return (result.rows as Record<string, unknown>[]).map((r) => ({
    memberId: r.member_id as string,
    fullName: r.full_name as string,
    memberCode: r.member_code as string,
    phone: r.phone as string | null,
    duePaise: Number(r.due),
    oldest: String(r.oldest),
  }));
}

/** Daily net collections between two dates (for charts). */
export async function dailyCollections(tx: Tx, ctx: GymContext, from: ISODate, to: ISODate) {
  requirePermission(ctx, "payments.view");
  const tz = ctx.gym.timezone;
  const result = await tx.execute(sql`
    select d::date as day, coalesce(sum(case when p.kind = 'payment' then p.amount_paise else -p.amount_paise end), 0)::bigint as net
    from generate_series(${from}::date, ${to}::date, interval '1 day') d
    left join payments p on p.gym_id = ${ctx.gym.id} and p.status = 'completed'
      and (p.paid_at at time zone ${tz})::date = d::date
    group by d order by d`);
  return (result.rows as { day: string | Date; net: string }[]).map((r) => ({
    day: typeof r.day === "string" ? r.day.slice(0, 10) : addDays(r.day.toISOString().slice(0, 10), 0),
    net: Number(r.net),
  }));
}

/** Everything a receipt needs. Members may open their own receipts. */
export async function getReceipt(tx: Tx, ctx: GymContext, paymentId: string) {
  const p = await getPayment(tx, ctx, paymentId);
  if (ctx.memberId !== p.memberId && !ctx.permissions.has("payments.view")) throw forbidden();
  const [member] = await tx.select().from(members).where(eq(members.id, p.memberId));
  const [membership] = p.membershipId ? await tx.select().from(memberships).where(eq(memberships.id, p.membershipId)) : [];
  const [gym] = await tx.select().from(gyms).where(eq(gyms.id, ctx.gym.id));
  const [recordedBy] = p.recordedByUserId
    ? await tx
        .select({ fullName: gymStaff.fullName })
        .from(gymStaff)
        .where(and(eq(gymStaff.userId, p.recordedByUserId), eq(gymStaff.gymId, ctx.gym.id)))
    : [];
  const balance = membership ? await membershipBalance(tx, ctx, membership.id) : null;
  return { payment: p, member: member!, membership: membership ?? null, gym: gym!, recordedBy: recordedBy?.fullName ?? null, balance };
}
export type ReceiptData = Awaited<ReturnType<typeof getReceipt>>;
