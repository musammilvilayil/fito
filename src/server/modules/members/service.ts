import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import { todayIn } from "@/shared/dates";
import type { MemberStanding } from "@/shared/membership";
import type { MemberListQuery, memberCreateSchema, memberUpdateSchema } from "@/shared/schemas/member";
import { randomToken } from "../../auth/crypto";
import { hasPermission, requirePermission, type GymContext } from "../../auth/context";
import { gymStaff, members } from "../../db/schema";
import type { Tx } from "../../db/tx";
import { badRequest, conflict, forbidden, notFound, uniqueViolation } from "../../errors";
import { audit } from "../audit";
import { nextCounter } from "../counters";
import { inviteUrl, newInvite } from "../staff/service";
import { currentMembershipJoin, standingExpr } from "./standing";

export function gymToday(ctx: GymContext) {
  return todayIn(ctx.gym.timezone);
}

export function soonDays(ctx: GymContext) {
  return ctx.gym.settings.expiringSoonDays ?? 7;
}

/** Trainers see only members assigned to them; staff with members.view_all see everyone. */
export function visibilityFilter(ctx: GymContext) {
  if (hasPermission(ctx, "members.view_all")) return sql`true`;
  if (ctx.staffId && hasPermission(ctx, "workouts.manage")) return sql`m.assigned_trainer_id = ${ctx.staffId}`;
  return sql`false`;
}

export function assertCanViewMembers(ctx: GymContext) {
  if (!hasPermission(ctx, "members.view_all") && !hasPermission(ctx, "workouts.manage")) throw forbidden();
}

export type MemberListItem = {
  id: string;
  memberCode: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  status: "active" | "inactive";
  joinedOn: string;
  hasAccount: boolean;
  trainerId: string | null;
  trainerName: string | null;
  planName: string | null;
  validUntil: string | null;
  standing: MemberStanding;
};

export async function listMembers(tx: Tx, ctx: GymContext, query: MemberListQuery) {
  assertCanViewMembers(ctx);
  const today = gymToday(ctx);
  const standing = standingExpr(today, soonDays(ctx));
  const conditions = [sql`m.gym_id = ${ctx.gym.id}`, visibilityFilter(ctx)];
  if (query.q) {
    const like = `%${query.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    // Only treat the search as a phone number when it is all digits/spaces/+,
    // so "M0001" matches the member code and not every phone containing 0001.
    const looksLikePhone = /^[\d\s+()-]+$/.test(query.q);
    const digits = looksLikePhone ? query.q.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "") : "";
    conditions.push(
      sql`(m.full_name ilike ${like} or m.member_code ilike ${like} or m.email ilike ${like}${
        digits.length >= 3 ? sql` or m.phone like ${`%${digits}%`}` : sql``
      })`,
    );
  }
  if (query.trainer) conditions.push(sql`m.assigned_trainer_id = ${query.trainer}`);
  const where = sql.join(conditions, sql` and `);
  const standingFilter = query.status === "all" ? sql`true` : sql`${standing} = ${query.status}`;

  const base = sql`from members m ${currentMembershipJoin(today)}
    left join gym_staff t on t.id = m.assigned_trainer_id
    where ${where}`;

  const rowsResult = await tx.execute(sql`
    select m.id, m.member_code, m.full_name, m.phone, m.email, m.status, m.joined_on,
      m.user_id is not null as has_account, m.assigned_trainer_id, t.full_name as trainer_name,
      cm.plan_name, cm.valid_until, ${standing} as standing
    ${base} and ${standingFilter}
    order by m.full_name asc
    limit ${query.pageSize} offset ${(query.page - 1) * query.pageSize}
  `);
  const countsResult = await tx.execute(sql`select ${standing} as standing, count(*)::int as n ${base} group by 1`);

  const counts: Record<string, number> = { all: 0 };
  for (const r of countsResult.rows as { standing: string; n: number }[]) {
    counts[r.standing] = r.n;
    counts.all! += r.n;
  }
  const items: MemberListItem[] = (rowsResult.rows as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    memberCode: r.member_code as string,
    fullName: r.full_name as string,
    phone: r.phone as string | null,
    email: r.email as string | null,
    status: r.status as "active" | "inactive",
    joinedOn: String(r.joined_on),
    hasAccount: Boolean(r.has_account),
    trainerId: r.assigned_trainer_id as string | null,
    trainerName: r.trainer_name as string | null,
    planName: r.plan_name as string | null,
    validUntil: r.valid_until ? String(r.valid_until) : null,
    standing: r.standing as MemberStanding,
  }));
  const total = query.status === "all" ? counts.all! : (counts[query.status] ?? 0);
  return { items, total, page: query.page, pageSize: query.pageSize, counts };
}

/** Loads one member, enforcing gym and trainer visibility. */
export async function getMember(tx: Tx, ctx: GymContext, memberId: string) {
  const isSelf = ctx.memberId === memberId;
  if (!isSelf) assertCanViewMembers(ctx);
  const today = gymToday(ctx);
  const result = await tx.execute(sql`
    select m.*, t.full_name as trainer_name, cm.id as current_membership_id, cm.plan_name, cm.start_date as current_start,
      cm.end_date as current_end, cm.valid_until, ${standingExpr(today, soonDays(ctx))} as standing
    from members m ${currentMembershipJoin(today)}
    left join gym_staff t on t.id = m.assigned_trainer_id
    where m.id = ${memberId} and m.gym_id = ${ctx.gym.id} and ${isSelf ? sql`true` : visibilityFilter(ctx)}
  `);
  const r = result.rows[0] as Record<string, unknown> | undefined;
  if (!r) throw notFound("Member not found.");
  return {
    id: r.id as string,
    memberCode: r.member_code as string,
    fullName: r.full_name as string,
    phone: r.phone as string | null,
    email: r.email as string | null,
    gender: r.gender as string | null,
    dateOfBirth: r.date_of_birth ? String(r.date_of_birth) : null,
    address: r.address as string | null,
    emergencyContactName: r.emergency_contact_name as string | null,
    emergencyContactPhone: r.emergency_contact_phone as string | null,
    joinedOn: String(r.joined_on),
    status: r.status as "active" | "inactive",
    notes: r.notes as string | null,
    hasAccount: Boolean(r.user_id),
    inviteExpiresAt: r.invite_expires_at ? new Date(r.invite_expires_at as string) : null,
    inviteActive: Boolean(r.invite_expires_at && new Date(r.invite_expires_at as string).getTime() > Date.now()),
    assignedTrainerId: r.assigned_trainer_id as string | null,
    trainerName: r.trainer_name as string | null,
    qrToken: r.qr_token as string,
    fitness: {
      fitnessGoal: r.fitness_goal as string | null,
      experienceLevel: r.experience_level as string | null,
      trainingDaysPerWeek: r.training_days_per_week as number | null,
      sessionMinutes: r.session_minutes as number | null,
      exercisePreferences: r.exercise_preferences as string | null,
      limitations: r.limitations as string | null,
      limitationTags: (r.limitation_tags as string[]) ?? [],
      medicalClearanceRequired: Boolean(r.medical_clearance_required),
      medicalClearanceNote: r.medical_clearance_note as string | null,
      healthScreening: r.health_screening as Record<string, unknown> | null,
    },
    current: r.current_membership_id
      ? {
          id: r.current_membership_id as string,
          planName: r.plan_name as string,
          startDate: String(r.current_start),
          endDate: String(r.current_end),
          validUntil: String(r.valid_until),
        }
      : null,
    standing: r.standing as MemberStanding,
    deactivatedAt: r.deactivated_at ? new Date(r.deactivated_at as string) : null,
    createdAt: new Date(r.created_at as string),
  };
}
export type MemberDetail = Awaited<ReturnType<typeof getMember>>;

async function assertTrainerInGym(tx: Tx, ctx: GymContext, trainerId: string | null | undefined) {
  if (!trainerId) return;
  const [t] = await tx
    .select({ id: gymStaff.id, role: gymStaff.role, status: gymStaff.status })
    .from(gymStaff)
    .where(and(eq(gymStaff.id, trainerId), eq(gymStaff.gymId, ctx.gym.id)));
  if (!t || t.status === "disabled") throw badRequest("Choose a trainer from this gym.");
}

function phoneConflict(err: unknown): never {
  const c = uniqueViolation(err);
  if (c === "members_gym_phone_key") throw conflict("Another member already uses this phone number.", { fieldErrors: { phone: "Already used by another member" } });
  throw err;
}

export async function newMemberCode(tx: Tx, gymId: string) {
  return `M${String(await nextCounter(tx, gymId, "member_code")).padStart(4, "0")}`;
}

export async function createMember(tx: Tx, ctx: GymContext, input: z.output<typeof memberCreateSchema>) {
  requirePermission(ctx, "members.manage");
  if (input.assignedTrainerId) {
    requirePermission(ctx, "members.assign_trainer");
    await assertTrainerInGym(tx, ctx, input.assignedTrainerId);
  }
  const invite = input.phone || input.email ? newInvite() : null;
  try {
    const [row] = await tx
      .insert(members)
      .values({
        gymId: ctx.gym.id,
        memberCode: await newMemberCode(tx, ctx.gym.id),
        fullName: input.fullName,
        phone: input.phone,
        email: input.email,
        gender: input.gender ?? null,
        dateOfBirth: input.dateOfBirth,
        address: input.address,
        emergencyContactName: input.emergencyContactName,
        emergencyContactPhone: input.emergencyContactPhone,
        notes: input.notes,
        joinedOn: input.joinedOn ?? gymToday(ctx),
        assignedTrainerId: input.assignedTrainerId,
        qrToken: randomToken(18),
        inviteTokenHash: invite?.tokenHash ?? null,
        inviteExpiresAt: invite?.expiresAt ?? null,
      })
      .returning({ id: members.id, memberCode: members.memberCode });
    await audit(tx, ctx, "member.create", "member", row!.id);
    return { ...row!, inviteUrl: invite ? inviteUrl(invite.token) : null };
  } catch (err) {
    phoneConflict(err);
  }
}

export async function updateMember(tx: Tx, ctx: GymContext, memberId: string, input: z.output<typeof memberUpdateSchema>) {
  requirePermission(ctx, "members.manage");
  await getMember(tx, ctx, memberId);
  if (input.assignedTrainerId !== undefined) {
    requirePermission(ctx, "members.assign_trainer");
    await assertTrainerInGym(tx, ctx, input.assignedTrainerId);
  }
  const patch: Partial<typeof members.$inferInsert> = { updatedAt: new Date() };
  for (const key of [
    "fullName",
    "phone",
    "email",
    "gender",
    "dateOfBirth",
    "address",
    "emergencyContactName",
    "emergencyContactPhone",
    "notes",
    "assignedTrainerId",
  ] as const) {
    if (input[key] !== undefined) (patch as Record<string, unknown>)[key] = input[key];
  }
  if (input.joinedOn) patch.joinedOn = input.joinedOn;
  try {
    await tx.update(members).set(patch).where(and(eq(members.id, memberId), eq(members.gymId, ctx.gym.id)));
  } catch (err) {
    phoneConflict(err);
  }
  await audit(tx, ctx, "member.update", "member", memberId, { fields: Object.keys(patch) });
  return getMember(tx, ctx, memberId);
}

export async function setMemberStatus(tx: Tx, ctx: GymContext, memberId: string, status: "active" | "inactive") {
  requirePermission(ctx, "members.manage");
  await getMember(tx, ctx, memberId);
  await tx
    .update(members)
    .set({ status, deactivatedAt: status === "inactive" ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(members.id, memberId), eq(members.gymId, ctx.gym.id)));
  await audit(tx, ctx, status === "inactive" ? "member.deactivate" : "member.activate", "member", memberId);
}

export async function assignTrainer(tx: Tx, ctx: GymContext, memberId: string, trainerId: string | null) {
  requirePermission(ctx, "members.assign_trainer");
  await getMember(tx, ctx, memberId);
  await assertTrainerInGym(tx, ctx, trainerId);
  await tx
    .update(members)
    .set({ assignedTrainerId: trainerId, updatedAt: new Date() })
    .where(and(eq(members.id, memberId), eq(members.gymId, ctx.gym.id)));
  await audit(tx, ctx, "member.assign_trainer", "member", memberId, { trainerId });
}

/** New member-portal invite link (replaces any earlier one). */
export async function createMemberInvite(tx: Tx, ctx: GymContext, memberId: string) {
  requirePermission(ctx, "members.manage");
  const member = await getMember(tx, ctx, memberId);
  if (member.hasAccount) throw conflict("This member already has an account.");
  if (!member.phone && !member.email) throw badRequest("Add a phone number or email first.");
  const invite = newInvite();
  await tx
    .update(members)
    .set({ inviteTokenHash: invite.tokenHash, inviteExpiresAt: invite.expiresAt, updatedAt: new Date() })
    .where(and(eq(members.id, memberId), eq(members.gymId, ctx.gym.id)));
  await audit(tx, ctx, "member.invite", "member", memberId);
  return { inviteUrl: inviteUrl(invite.token), expiresAt: invite.expiresAt, phone: member.phone, fullName: member.fullName };
}

/** Replaces a member's QR code (e.g. if a screenshot was shared). */
export async function regenerateQr(tx: Tx, ctx: GymContext, memberId: string) {
  requirePermission(ctx, "members.manage");
  await getMember(tx, ctx, memberId);
  await tx
    .update(members)
    .set({ qrToken: randomToken(18), updatedAt: new Date() })
    .where(and(eq(members.id, memberId), eq(members.gymId, ctx.gym.id)));
  await audit(tx, ctx, "member.qr_regenerate", "member", memberId);
}
