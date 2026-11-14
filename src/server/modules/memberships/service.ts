import "server-only";
import { and, asc, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import type { z } from "zod";
import { addDays, diffDays, type ISODate } from "@/shared/dates";
import { periodEnd, renewalStart } from "@/shared/membership";
import { rupeesToPaise } from "@/shared/money";
import { priceBreakdown, type cancelMembershipSchema, type freezeSchema, type sellMembershipSchema, type unfreezeSchema } from "@/shared/schemas/billing";
import { requirePermission, type GymContext } from "../../auth/context";
import { membershipFreezes, memberships, payments } from "../../db/schema";
import type { Tx } from "../../db/tx";
import { badRequest, conflict, forbidden, notFound } from "../../errors";
import { audit } from "../audit";
import { getMember, gymToday } from "../members/service";
import { getPlan } from "../plans/service";
import { insertPayment } from "../payments/service";

/** Net amount paid towards each membership (payments minus refunds, completed only). */
// The outer column is written out fully qualified: an interpolated column would
// render as a bare "id", which inside this subquery would mean payments.id.
export const paidExpr = sql<number>`coalesce((
  select sum(case when p.kind = 'payment' then p.amount_paise else -p.amount_paise end)
  from payments p where p.membership_id = "memberships"."id" and p.status = 'completed'
), 0)::bigint`;

export type MembershipRow = Awaited<ReturnType<typeof listMemberMemberships>>[number];

export async function listMemberMemberships(tx: Tx, ctx: GymContext, memberId: string) {
  if (ctx.memberId !== memberId && !ctx.permissions.has("payments.view") && !ctx.permissions.has("memberships.manage")) {
    throw forbidden();
  }
  const rows = await tx
    .select({ m: memberships, paid: paidExpr })
    .from(memberships)
    .where(and(eq(memberships.gymId, ctx.gym.id), eq(memberships.memberId, memberId)))
    .orderBy(desc(memberships.startDate));
  const today = gymToday(ctx);
  return rows.map(({ m, paid }) => {
    const paidPaise = Number(paid);
    const outstanding = m.state === "cancelled" ? 0 : Math.max(0, m.totalPaise - paidPaise);
    const phase =
      m.state === "cancelled"
        ? "cancelled"
        : m.frozenSince
          ? "frozen"
          : m.startDate > today
            ? "upcoming"
            : m.endDate < today
              ? "ended"
              : "current";
    return { ...m, paidPaise, outstandingPaise: outstanding, phase };
  });
}

async function getMembership(tx: Tx, ctx: GymContext, membershipId: string) {
  const [m] = await tx
    .select()
    .from(memberships)
    .where(and(eq(memberships.id, membershipId), eq(memberships.gymId, ctx.gym.id)));
  if (!m) throw notFound("Membership not found.");
  return m;
}

/** Latest end date across the member's active memberships (null if none). */
async function validUntil(tx: Tx, ctx: GymContext, memberId: string): Promise<{ id: string; endDate: ISODate } | null> {
  const [row] = await tx
    .select({ id: memberships.id, endDate: memberships.endDate })
    .from(memberships)
    .where(and(eq(memberships.gymId, ctx.gym.id), eq(memberships.memberId, memberId), eq(memberships.state, "active")))
    .orderBy(desc(memberships.endDate))
    .limit(1);
  return row ?? null;
}

function parseDiscount(input: z.output<typeof sellMembershipSchema>) {
  const raw = input.discountValue === null || input.discountValue === undefined ? "" : String(input.discountValue).trim();
  if (raw === "" || raw === "0") return { discountPaise: 0, discountPercent: 0 };
  if (input.discountType === "percent") {
    const pct = Number(raw);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      throw badRequest("Discount must be between 0 and 100%.", { fieldErrors: { discountValue: "0–100%" } });
    }
    return { discountPaise: 0, discountPercent: pct };
  }
  const paise = rupeesToPaise(raw);
  if (paise === null) throw badRequest("Enter the discount as an amount, e.g. 200.", { fieldErrors: { discountValue: "Invalid amount" } });
  return { discountPaise: paise, discountPercent: 0 };
}

/**
 * Sells a new membership or a renewal. Early renewals start the day after the
 * current membership ends; late renewals start today (both overridable).
 * Optionally records the payment and issues a receipt in the same step.
 */
export async function sellMembership(tx: Tx, ctx: GymContext, input: z.output<typeof sellMembershipSchema>) {
  requirePermission(ctx, "memberships.manage");
  const member = await getMember(tx, ctx, input.memberId);
  if (member.status === "inactive") throw badRequest("Reactivate this member before selling a membership.");
  const plan = await getPlan(tx, ctx, input.planId);
  if (!plan.isActive) throw badRequest("This plan is archived. Choose an active plan.");

  const today = gymToday(ctx);
  const current = await validUntil(tx, ctx, member.id);
  const startDate = input.startDate ?? renewalStart(current?.endDate ?? null, today);
  const endDate = periodEnd(startDate, plan.durationUnit, plan.durationValue);

  const overlapping = await tx
    .select({ id: memberships.id, startDate: memberships.startDate, endDate: memberships.endDate })
    .from(memberships)
    .where(
      and(
        eq(memberships.gymId, ctx.gym.id),
        eq(memberships.memberId, member.id),
        eq(memberships.state, "active"),
        sql`${memberships.startDate} <= ${endDate}::date and ${memberships.endDate} >= ${startDate}::date`,
      ),
    );
  if (overlapping.length > 0) {
    const o = overlapping[0]!;
    throw conflict(`This overlaps an existing membership (${o.startDate} to ${o.endDate}). Start it on ${addDays(o.endDate, 1)} or later.`, {
      fieldErrors: { startDate: "Overlaps an existing membership" },
    });
  }

  const { discountPaise, discountPercent } = parseDiscount(input);
  const breakdown = priceBreakdown({
    pricePaise: plan.pricePaise,
    admissionFeePaise: plan.admissionFeePaise,
    chargeAdmission: input.chargeAdmission,
    discountType: input.discountType,
    discountPaise,
    discountPercent,
  });
  if (breakdown.discount > breakdown.subtotal) {
    throw badRequest("Discount can't be more than the price.", { fieldErrors: { discountValue: "More than the price" } });
  }
  if (input.payNow && input.payment && input.payment.amount > breakdown.total) {
    throw badRequest("Payment is more than the amount due.", { fieldErrors: { "payment.amount": "More than the amount due" } });
  }

  const [ms] = await tx
    .insert(memberships)
    .values({
      gymId: ctx.gym.id,
      memberId: member.id,
      planId: plan.id,
      planName: plan.name,
      durationUnit: plan.durationUnit,
      durationValue: plan.durationValue,
      kind: current ? "renewal" : "new",
      startDate,
      endDate,
      pricePaise: breakdown.price,
      admissionFeePaise: breakdown.admission,
      discountPaise: breakdown.discount,
      totalPaise: breakdown.total,
      discountNote: input.discountNote,
      renewedFromId: current?.id ?? null,
      createdByUserId: ctx.user.id,
    })
    .returning();
  await audit(tx, ctx, current ? "membership.renew" : "membership.sell", "membership", ms!.id, {
    plan: plan.name,
    total: breakdown.total,
    discount: breakdown.discount,
  });

  let payment: Awaited<ReturnType<typeof insertPayment>> | null = null;
  if (input.payNow && input.payment && input.payment.amount > 0) {
    payment = await insertPayment(tx, ctx, {
      memberId: member.id,
      membershipId: ms!.id,
      amountPaise: input.payment.amount,
      method: input.payment.method,
      reference: input.payment.reference,
      notes: null,
      paidOn: null,
    });
  }
  return { membership: ms!, payment };
}

export async function freezeMembership(tx: Tx, ctx: GymContext, membershipId: string, input: z.output<typeof freezeSchema>) {
  requirePermission(ctx, "memberships.manage");
  const m = await getMembership(tx, ctx, membershipId);
  const today = gymToday(ctx);
  const start = input.startDate ?? today;
  if (m.state !== "active") throw badRequest("Only active memberships can be frozen.");
  if (m.frozenSince) throw conflict("This membership is already frozen.");
  if (start > today) throw badRequest("A freeze can't start in the future.", { fieldErrors: { startDate: "Today or earlier" } });
  if (start < m.startDate || start > m.endDate) {
    throw badRequest("The freeze date must be within the membership period.", { fieldErrors: { startDate: "Outside the membership" } });
  }
  await tx.update(memberships).set({ frozenSince: start, updatedAt: new Date() }).where(eq(memberships.id, m.id));
  await tx.insert(membershipFreezes).values({ gymId: ctx.gym.id, membershipId: m.id, startDate: start, reason: input.reason, createdByUserId: ctx.user.id });
  await audit(tx, ctx, "membership.freeze", "membership", m.id, { start, reason: input.reason });
}

/**
 * Ends a freeze. Frozen days are added to the end date, and any later
 * (already-paid) renewals move by the same number of days.
 */
export async function unfreezeMembership(tx: Tx, ctx: GymContext, membershipId: string, input: z.output<typeof unfreezeSchema>) {
  requirePermission(ctx, "memberships.manage");
  const m = await getMembership(tx, ctx, membershipId);
  if (!m.frozenSince) throw badRequest("This membership isn't frozen.");
  const resume = input.resumeDate ?? gymToday(ctx);
  if (resume < m.frozenSince) throw badRequest("Resume date is before the freeze started.", { fieldErrors: { resumeDate: "Before the freeze" } });
  const days = diffDays(m.frozenSince, resume);

  await tx
    .update(memberships)
    .set({ frozenSince: null, endDate: addDays(m.endDate, days), totalFrozenDays: m.totalFrozenDays + days, updatedAt: new Date() })
    .where(eq(memberships.id, m.id));
  if (days > 0) {
    await tx
      .update(memberships)
      .set({
        startDate: sql`${memberships.startDate} + ${days}::int`,
        endDate: sql`${memberships.endDate} + ${days}::int`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(memberships.gymId, ctx.gym.id),
          eq(memberships.memberId, m.memberId),
          eq(memberships.state, "active"),
          ne(memberships.id, m.id),
          gt(memberships.startDate, m.endDate),
        ),
      );
  }
  await tx
    .update(membershipFreezes)
    .set({ endDate: resume })
    .where(and(eq(membershipFreezes.membershipId, m.id), isNull(membershipFreezes.endDate)));
  await audit(tx, ctx, "membership.unfreeze", "membership", m.id, { resume, days });
  return { extendedByDays: days, newEndDate: addDays(m.endDate, days) };
}

export async function cancelMembership(tx: Tx, ctx: GymContext, membershipId: string, input: z.output<typeof cancelMembershipSchema>) {
  requirePermission(ctx, "memberships.manage");
  const m = await getMembership(tx, ctx, membershipId);
  if (m.state === "cancelled") throw conflict("This membership is already cancelled.");
  await tx
    .update(memberships)
    .set({ state: "cancelled", frozenSince: null, cancelledAt: new Date(), cancelReason: input.reason, updatedAt: new Date() })
    .where(eq(memberships.id, m.id));
  await tx
    .update(membershipFreezes)
    .set({ endDate: gymToday(ctx) })
    .where(and(eq(membershipFreezes.membershipId, m.id), isNull(membershipFreezes.endDate)));
  await audit(tx, ctx, "membership.cancel", "membership", m.id, { reason: input.reason });
}

export async function listFreezes(tx: Tx, ctx: GymContext, memberId: string) {
  return tx
    .select({ f: membershipFreezes })
    .from(membershipFreezes)
    .innerJoin(memberships, eq(memberships.id, membershipFreezes.membershipId))
    .where(and(eq(membershipFreezes.gymId, ctx.gym.id), eq(memberships.memberId, memberId)))
    .orderBy(asc(membershipFreezes.startDate))
    .then((rows) => rows.map((r) => r.f));
}

/** Payments recorded against a member (newest first). */
export async function listMemberPayments(tx: Tx, ctx: GymContext, memberId: string) {
  if (ctx.memberId !== memberId && !ctx.permissions.has("payments.view")) throw forbidden();
  return tx
    .select()
    .from(payments)
    .where(and(eq(payments.gymId, ctx.gym.id), eq(payments.memberId, memberId)))
    .orderBy(desc(payments.paidAt));
}
