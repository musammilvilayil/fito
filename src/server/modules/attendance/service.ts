import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { z } from "zod";
import { addDays, diffDays, type ISODate } from "@/shared/dates";
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
  const member = await getMember(tx, ctx, memberId).catch(() => {
    throw new CheckInRefused("unknown_member", "Member not found.");
  });
  const brief = { id: member.id, fullName: member.fullName, memberCode: member.memberCode, standing: member.standing };

  let overridden = false;
  if (!CAN_CHECK_IN.has(member.standing)) {
    if (member.standing === "inactive") throw new CheckInRefused("inactive", `${member.fullName} is deactivated.`, brief);
    const reason =
      member.standing === "frozen"
        ? "Membership is frozen."
        : member.standing === "upcoming"
          ? `Membership starts on ${member.current?.startDate}.`
          : member.standing === "expired"
            ? `Membership expired on ${member.current?.validUntil}.`
            : "No membership.";
    if (!input.overrideReason) throw new CheckInRefused(`not_allowed_${member.standing}`, `${STANDING_LABELS[member.standing]}: ${reason}`, brief);
    if (!hasPermission(ctx, "attendance.override")) throw forbidden("Only the owner or a manager can let someone in without an active membership.");
    overridden = true;
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
    throw new CheckInRefused("already_checked_in", `${member.fullName} already checked in today${time ? ` at ${time}` : ""}.`, brief);
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
        method: input.qr ? "qr" : "manual",
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
    member: {
      ...brief,
      planName: member.current?.planName ?? null,
      validUntil: member.current?.validUntil ?? null,
      daysLeft,
      duePaise: hasPermission(ctx, "payments.view") ? await duesForMember(tx, ctx, member.id) : 0,
    },
  };
}

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
      m.full_name, m.member_code, s.full_name as recorded_by
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

