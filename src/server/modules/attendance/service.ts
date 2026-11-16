import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { z } from "zod";
import { addDays, diffDays, formatDate, type ISODate } from "@/shared/dates";
import { BATCH_LABELS, batchHoursLabel, batchHoursOf, inBatch, timeIn } from "@/shared/batches";
import { CAN_CHECK_IN, STANDING_LABELS, type MemberStanding } from "@/shared/membership";
import { parseQrPayload, type checkInSchema } from "@/shared/schemas/attendance";
import { hasPermission, requirePermission, type GymContext } from "../../auth/context";
import { attendance, members } from "../../db/schema";
import type { Tx } from "../../db/tx";
import { AppError, badRequest, forbidden, notFound, uniqueViolation } from "../../errors";
import { audit } from "../audit";
import { getMember, gymToday } from "../members/service";
import { duesForMember } from "../payments/service";

export type CheckInResult = {
  status: "checked_in";
  attendanceId: string;
  checkInAt: Date;
  overridden: boolean;
  /** Set when the member came outside their batch and the gym only warns. */
  batchNote: string | null;
  member: {
    id: string;
    fullName: string;
    memberCode: string;
    planName: string | null;
    validUntil: string | null;
    daysLeft: number | null;
    standing: MemberStanding;
    duePaise: number;
  };
};

/** Error with the member attached, so the scanner can show who was refused and why. */
export class CheckInRefused extends AppError {
  constructor(code: string, message: string, member?: { id: string; fullName: string; memberCode: string; standing: MemberStanding }) {
    super(code === "already_checked_in" ? 409 : 422, code, message, member ? { member } : undefined);
  }
}

async function findMemberId(tx: Tx, ctx: GymContext, input: z.output<typeof checkInSchema>): Promise<string> {
  if (input.memberId) return input.memberId;
  const token = parseQrPayload(input.qr ?? "");
  if (!token) throw new CheckInRefused("invalid_qr", "This isn't a FITO member QR code.");
  const [m] = await tx
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.gymId, ctx.gym.id), eq(members.qrToken, token)));
  // A code from another gym, or an old (regenerated) code, is not found.
  if (!m) throw new CheckInRefused("unknown_qr", "QR code not recognised. It may be from another gym or replaced by a newer code.");
  return m.id;
}

/**
 * Checks a member in by QR code or by hand. Allowed only with an active
 * membership (owners/managers may override with a reason) and once per day.
 */
export async function checkIn(tx: Tx, ctx: GymContext, input: z.output<typeof checkInSchema>): Promise<CheckInResult> {
  requirePermission(ctx, "attendance.record");
  const memberId = await findMemberId(tx, ctx, input);
  return recordCheckIn(tx, ctx, memberId, { method: input.qr ? "qr" : "manual", overrideReason: input.overrideReason ?? null, self: false });
}

/** A member checks themself in by scanning the gym's entrance QR. Same rules, no override. */
export async function selfCheckIn(tx: Tx, ctx: GymContext): Promise<CheckInResult> {
  if (!ctx.memberId) throw forbidden("Only members can check themselves in.");
  return recordCheckIn(tx, ctx, ctx.memberId, { method: "qr", overrideReason: null, self: true });
}

async function recordCheckIn(
  tx: Tx,
  ctx: GymContext,
  memberId: string,
  opts: { method: "qr" | "manual"; overrideReason: string | null; self: boolean },
): Promise<CheckInResult> {
  const input = { overrideReason: opts.overrideReason };
  const member = await getMember(tx, ctx, memberId).catch(() => {
    throw new CheckInRefused("unknown_member", "Member not found.");
  });
  const brief = { id: member.id, fullName: member.fullName, memberCode: member.memberCode, standing: member.standing };
  const who = opts.self ? "You" : member.fullName;

  let overridden = false;
  if (!CAN_CHECK_IN.has(member.standing)) {
    if (member.standing === "inactive") throw new CheckInRefused("inactive", `${who} ${opts.self ? "are" : "is"} deactivated. Please speak to the front desk.`, brief);
    const reason =
      member.standing === "frozen"
        ? "Membership is frozen."
        : member.standing === "upcoming"
          ? `Membership starts on ${member.current ? formatDate(member.current.startDate) : "a later date"}.`
          : member.standing === "expired"
            ? `Membership expired on ${member.current ? formatDate(member.current.validUntil) : "an earlier date"}.`
            : "No membership.";
    if (opts.self) throw new CheckInRefused(`not_allowed_${member.standing}`, `${STANDING_LABELS[member.standing]}: ${reason} Please see the front desk.`, brief);
    if (!input.overrideReason) throw new CheckInRefused(`not_allowed_${member.standing}`, `${STANDING_LABELS[member.standing]}: ${reason}`, brief);
    if (!hasPermission(ctx, "attendance.override")) throw forbidden("Only the owner or a manager can let someone in without an active membership.");
    overridden = true;
  }

  // Morning/evening batches.
  let batchNote: string | null = null;
  const policy = ctx.gym.settings.batchPolicy ?? "warn";
  if (policy !== "off" && member.batch !== "any") {
    const hours = batchHoursOf(ctx.gym.settings);
    if (!inBatch(member.batch, timeIn(ctx.gym.timezone), hours)) {
      const note = `${opts.self ? "Your" : `${member.fullName}'s`} batch is ${BATCH_LABELS[member.batch].toLowerCase()} (${batchHoursLabel(member.batch, hours)}).`;
      if (policy === "enforce") {
        if (opts.self) throw new CheckInRefused("outside_batch", `${note} Please come during your batch, or ask the front desk.`, brief);
        if (!input.overrideReason) throw new CheckInRefused("outside_batch", `Outside batch: ${note}`, brief);
        if (!hasPermission(ctx, "attendance.override")) throw forbidden("Only the owner or a manager can let someone in outside their batch.");
        overridden = true;
      } else {
        batchNote = `Outside batch: ${note}`;
      }
    }
  }

  const today = gymToday(ctx);
  const alreadyIn = async () => {
    const [existing] = await tx
      .select({ at: attendance.checkInAt })
      .from(attendance)
      .where(and(eq(attendance.gymId, ctx.gym.id), eq(attendance.memberId, member.id), eq(attendance.checkInDate, today)));
    return existing?.at ?? null;
  };
  const refuseDuplicate = (at: Date | null): never => {
    const time = at?.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: ctx.gym.timezone });
    throw new CheckInRefused("already_checked_in", `${opts.self ? "You" : member.fullName} already checked in today${time ? ` at ${time}` : ""}.`, brief);
  };
  const earlier = await alreadyIn();
  if (earlier) refuseDuplicate(earlier);

  let row: typeof attendance.$inferSelect;
  try {
    [row] = (await tx
      .insert(attendance)
      .values({
        gymId: ctx.gym.id,
        memberId: member.id,
        checkInDate: today,
        method: opts.method,
        overrideReason: overridden ? input.overrideReason : null,
        recordedByUserId: ctx.user.id,
      })
      .returning()) as [typeof attendance.$inferSelect];
  } catch (err) {
    // Two scans at the same instant: the unique index lets only one through.
    // (The transaction is aborted now, so don't query again.)
    if (uniqueViolation(err) === "attendance_member_day_key") refuseDuplicate(null);
    throw err;
  }
  if (overridden) await audit(tx, ctx, "attendance.override", "attendance", row.id, { reason: input.overrideReason });
  const daysLeft = member.current ? diffDays(today, member.current.validUntil) : null;
  return {
    status: "checked_in",
    attendanceId: row.id,
    checkInAt: row.checkInAt,
    overridden,
    batchNote,
    member: {
      ...brief,
      planName: member.current?.planName ?? null,
      validUntil: member.current?.validUntil ?? null,
      daysLeft,
      duePaise: hasPermission(ctx, "payments.view") || opts.self ? await duesForMember(tx, ctx, member.id) : 0,
    },
  };
}

/** A member checks themself out by scanning the gym's exit QR. */
export async function selfCheckOut(tx: Tx, ctx: GymContext) {
  if (!ctx.memberId) throw forbidden("Only members can check themselves out.");
  const today = gymToday(ctx);
  const [visit] = await tx
    .select()
    .from(attendance)
    .where(and(eq(attendance.gymId, ctx.gym.id), eq(attendance.memberId, ctx.memberId), eq(attendance.checkInDate, today)));
  if (!visit) throw new CheckInRefused("not_checked_in", "You haven't checked in today. Scan the entrance code when you arrive.");
  if (visit.checkOutAt) {
    return { status: "already_checked_out" as const, checkInAt: visit.checkInAt, checkOutAt: visit.checkOutAt, minutes: minutesBetween(visit.checkInAt, visit.checkOutAt) };
  }
  const [row] = await tx.update(attendance).set({ checkOutAt: new Date() }).where(eq(attendance.id, visit.id)).returning();
  return { status: "checked_out" as const, checkInAt: row!.checkInAt, checkOutAt: row!.checkOutAt!, minutes: minutesBetween(row!.checkInAt, row!.checkOutAt!) };
}

const minutesBetween = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000));

export async function checkOut(tx: Tx, ctx: GymContext, attendanceId: string) {
  requirePermission(ctx, "attendance.record");
  const [row] = await tx
    .update(attendance)
    .set({ checkOutAt: new Date() })
    .where(and(eq(attendance.id, attendanceId), eq(attendance.gymId, ctx.gym.id), isNull(attendance.checkOutAt)))
    .returning({ id: attendance.id });
  if (!row) throw badRequest("Already checked out, or not found.");
}

/** Removes a check-in recorded by mistake (owner/manager), with an audit entry. */
export async function deleteCheckIn(tx: Tx, ctx: GymContext, attendanceId: string) {
  requirePermission(ctx, "attendance.override");
  const [row] = await tx
    .delete(attendance)
    .where(and(eq(attendance.id, attendanceId), eq(attendance.gymId, ctx.gym.id)))
    .returning({ memberId: attendance.memberId, date: attendance.checkInDate });
  if (!row) throw notFound("Check-in not found.");
  await audit(tx, ctx, "attendance.delete", "attendance", attendanceId, row);
}

function assertCanView(ctx: GymContext) {
  if (!hasPermission(ctx, "attendance.view") && !hasPermission(ctx, "attendance.record")) throw forbidden();
}

/** Trainers only see attendance for their assigned members. */
function scope(ctx: GymContext) {
  if (hasPermission(ctx, "members.view_all") || hasPermission(ctx, "attendance.record")) return sql`true`;
  return sql`m.assigned_trainer_id = ${ctx.staffId ?? "00000000-0000-0000-0000-000000000000"}`;
}

export async function listDay(tx: Tx, ctx: GymContext, date: ISODate) {
  assertCanView(ctx);
  const result = await tx.execute(sql`
    select a.id, a.check_in_at, a.check_out_at, a.method, a.override_reason, a.member_id,
      m.full_name, m.member_code, s.full_name as recorded_by,
      (a.recorded_by_user_id is not null and a.recorded_by_user_id = m.user_id) as self_scan
    from attendance a
    join members m on m.id = a.member_id
    left join gym_staff s on s.user_id = a.recorded_by_user_id and s.gym_id = a.gym_id
    where a.gym_id = ${ctx.gym.id} and a.check_in_date = ${date}::date and ${scope(ctx)}
    order by a.check_in_at desc`);
  return (result.rows as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    memberId: r.member_id as string,
    fullName: r.full_name as string,
    memberCode: r.member_code as string,
    checkInAt: new Date(r.check_in_at as string),
    checkOutAt: r.check_out_at ? new Date(r.check_out_at as string) : null,
    method: r.method as "qr" | "manual",
    overrideReason: r.override_reason as string | null,
    recordedBy: r.recorded_by as string | null,
    /** The member scanned the entrance code themselves. */
    selfScan: r.self_scan === true,
  }));
}

/** People probably inside: checked in today, not checked out, within the typical visit length. */
export async function insideNow(tx: Tx, ctx: GymContext) {
  const minutes = ctx.gym.settings.sessionMinutes ?? 90;
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(attendance)
    .where(
      and(
        eq(attendance.gymId, ctx.gym.id),
        eq(attendance.checkInDate, gymToday(ctx)),
        isNull(attendance.checkOutAt),
        sql`${attendance.checkInAt} > now() - make_interval(mins => ${minutes})`,
      ),
    );
  return row?.n ?? 0;
}

export async function attendanceSummary(tx: Tx, ctx: GymContext) {
  assertCanView(ctx);
  const today = gymToday(ctx);
  const [row] = (
    await tx.execute(sql`
      select
        count(*) filter (where a.check_in_date = ${today}::date)::int as today,
        count(*) filter (where a.check_in_date = ${addDays(today, -1)}::date)::int as yesterday,
        round(count(*) filter (where a.check_in_date between ${addDays(today, -7)}::date and ${addDays(today, -1)}::date) / 7.0, 1)::float as avg7
      from attendance a join members m on m.id = a.member_id
      where a.gym_id = ${ctx.gym.id} and a.check_in_date >= ${addDays(today, -7)}::date and ${scope(ctx)}`)
  ).rows as { today: number; yesterday: number; avg7: number }[];
  return { today: row?.today ?? 0, yesterday: row?.yesterday ?? 0, avg7: row?.avg7 ?? 0, insideNow: await insideNow(tx, ctx) };
}

export async function dailyCounts(tx: Tx, ctx: GymContext, from: ISODate, to: ISODate) {
  assertCanView(ctx);
  const result = await tx.execute(sql`
    select d::date as day, count(a.id)::int as n
    from generate_series(${from}::date, ${to}::date, interval '1 day') d
    left join attendance a on a.gym_id = ${ctx.gym.id} and a.check_in_date = d::date
    group by d order by d`);
  return (result.rows as { day: string | Date; n: number }[]).map((r) => ({
    day: typeof r.day === "string" ? r.day.slice(0, 10) : r.day.toISOString().slice(0, 10),
    count: r.n,
  }));
}

/** Check-ins by hour of day (gym local time) over a range: when the gym is busiest. */
export async function hourlyCounts(tx: Tx, ctx: GymContext, from: ISODate, to: ISODate) {
  assertCanView(ctx);
  const result = await tx.execute(sql`
    select extract(hour from (a.check_in_at at time zone ${ctx.gym.timezone}))::int as hour, count(*)::int as n
    from attendance a
    where a.gym_id = ${ctx.gym.id} and a.check_in_date between ${from}::date and ${to}::date
    group by 1`);
  const byHour = new Map((result.rows as { hour: number; n: number }[]).map((r) => [r.hour, r.n]));
  return Array.from({ length: 24 }, (_, hour) => ({ hour, count: byHour.get(hour) ?? 0 }));
}

/** A member's visits, this month's count and their current weekly streak. */
export async function memberAttendance(tx: Tx, ctx: GymContext, memberId: string, limit = 60) {
  if (ctx.memberId !== memberId) {
    assertCanView(ctx);
    await getMember(tx, ctx, memberId);
  }
  const visits = await tx
    .select({ id: attendance.id, date: attendance.checkInDate, checkInAt: attendance.checkInAt, checkOutAt: attendance.checkOutAt, method: attendance.method })
    .from(attendance)
    .where(and(eq(attendance.gymId, ctx.gym.id), eq(attendance.memberId, memberId)))
    .orderBy(desc(attendance.checkInDate))
    .limit(limit);
  const today = gymToday(ctx);
  const monthStart = `${today.slice(0, 8)}01`;
  const [counts] = (
    await tx.execute(sql`
      select count(*) filter (where check_in_date >= ${monthStart}::date)::int as this_month,
             count(*) filter (where check_in_date >= ${addDays(today, -29)}::date)::int as last30,
             count(*)::int as total
      from attendance where gym_id = ${ctx.gym.id} and member_id = ${memberId}`)
  ).rows as { this_month: number; last30: number; total: number }[];
  const dates = new Set(visits.map((v) => v.date));
  // Consecutive days ending today (or yesterday, if they haven't come in yet today).
  let streak = 0;
  let cursor = dates.has(today) ? today : addDays(today, -1);
  while (dates.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return { visits, thisMonth: counts?.this_month ?? 0, last30: counts?.last30 ?? 0, total: counts?.total ?? 0, streak, lastVisit: visits[0]?.date ?? null };
}

/** Members to manually check in: active members matching a search. */
export async function searchForCheckIn(tx: Tx, ctx: GymContext, q: string) {
  requirePermission(ctx, "attendance.record");
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const digits = /^[\d\s+()-]+$/.test(q) ? q.replace(/\D/g, "") : "";
  const rows = await tx
    .select({ id: members.id, fullName: members.fullName, memberCode: members.memberCode, phone: members.phone })
    .from(members)
    .where(
      and(
        eq(members.gymId, ctx.gym.id),
        eq(members.status, "active"),
        sql`(${members.fullName} ilike ${like} or ${members.memberCode} ilike ${like}${digits.length >= 3 ? sql` or ${members.phone} like ${`%${digits}%`}` : sql``})`,
      ),
    )
    .orderBy(members.fullName)
    .limit(8);
  return rows;
}

