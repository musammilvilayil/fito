import "server-only";
import { and, asc, eq, ne, or, sql } from "drizzle-orm";
import type { z } from "zod";
import type { StaffRole } from "@/shared/permissions";
import type { staffInviteSchema, staffUpdateSchema } from "@/shared/schemas/gym";
import { hashToken, randomToken } from "../../auth/crypto";
import { requirePermission, type GymContext } from "../../auth/context";
import { gymStaff, members, passwordResetTokens } from "../../db/schema";
import type { Tx } from "../../db/tx";
import { env } from "../../env";
import { badRequest, conflict, forbidden, notFound } from "../../errors";
import { audit } from "../audit";

export const INVITE_TTL_DAYS = 7;
const RESET_TTL_HOURS = 48;

export function inviteUrl(token: string) {
  return new URL(`/invite/${token}`, env().APP_URL).toString();
}

export function newInvite() {
  const token = randomToken();
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
  };
}

/** Managers can't create or change owners/managers; only owners can. */
function assertCanManageRole(ctx: GymContext, role: StaffRole) {
  if ((role === "owner" || role === "manager") && ctx.role !== "owner") {
    throw forbidden("Only the gym owner can manage owners and managers.");
  }
}

export async function listStaff(tx: Tx, ctx: GymContext) {
  return tx
    .select({
      id: gymStaff.id,
      fullName: gymStaff.fullName,
      email: gymStaff.email,
      phone: gymStaff.phone,
      role: gymStaff.role,
      status: gymStaff.status,
      specializations: gymStaff.specializations,
      bio: gymStaff.bio,
      userId: gymStaff.userId,
      inviteExpiresAt: gymStaff.inviteExpiresAt,
      createdAt: gymStaff.createdAt,
      assignedMembers: sql<number>`(select count(*)::int from ${members} m where m.assigned_trainer_id = ${gymStaff.id} and m.status = 'active')`,
    })
    .from(gymStaff)
    .where(eq(gymStaff.gymId, ctx.gym.id))
    .orderBy(asc(gymStaff.role), asc(gymStaff.fullName));
}

export async function listTrainers(tx: Tx, ctx: GymContext) {
  return tx
    .select({ id: gymStaff.id, fullName: gymStaff.fullName, specializations: gymStaff.specializations })
    .from(gymStaff)
    .where(
      and(
        eq(gymStaff.gymId, ctx.gym.id),
        ne(gymStaff.status, "disabled"),
        or(eq(gymStaff.role, "trainer"), eq(gymStaff.role, "owner"), eq(gymStaff.role, "manager")),
      ),
    )
    .orderBy(asc(gymStaff.fullName));
}

export async function inviteStaff(tx: Tx, ctx: GymContext, input: z.output<typeof staffInviteSchema>) {
  requirePermission(ctx, "staff.manage");
  assertCanManageRole(ctx, input.role);
  const invite = newInvite();
  const [row] = await tx
    .insert(gymStaff)
    .values({
      gymId: ctx.gym.id,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      role: input.role,
      status: "invited",
      specializations: input.specializations,
      inviteTokenHash: invite.tokenHash,
      inviteExpiresAt: invite.expiresAt,
    })
    .returning({ id: gymStaff.id });
  await audit(tx, ctx, "staff.invite", "gym_staff", row!.id, { role: input.role });
  return { id: row!.id, inviteUrl: inviteUrl(invite.token), expiresAt: invite.expiresAt };
}

async function getStaff(tx: Tx, ctx: GymContext, staffId: string) {
  const [row] = await tx
    .select()
    .from(gymStaff)
    .where(and(eq(gymStaff.id, staffId), eq(gymStaff.gymId, ctx.gym.id)));
  if (!row) throw notFound("Staff member not found.");
  return row;
}

async function activeOwnerCount(tx: Tx, ctx: GymContext) {
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(gymStaff)
    .where(and(eq(gymStaff.gymId, ctx.gym.id), eq(gymStaff.role, "owner"), eq(gymStaff.status, "active")));
  return r?.n ?? 0;
}

export async function updateStaff(tx: Tx, ctx: GymContext, staffId: string, input: z.output<typeof staffUpdateSchema>) {
  requirePermission(ctx, "staff.manage");
  const current = await getStaff(tx, ctx, staffId);
  assertCanManageRole(ctx, current.role);
  if (input.role) assertCanManageRole(ctx, input.role);

  const losingOwner =
    current.role === "owner" &&
    current.status === "active" &&
    ((input.role && input.role !== "owner") || input.status === "disabled");
  if (losingOwner && (await activeOwnerCount(tx, ctx)) <= 1) {
    throw badRequest("A gym needs at least one active owner. Make someone else an owner first.");
  }
  if (input.status === "active" && current.status === "invited") {
    throw badRequest("This person hasn't accepted their invite yet.");
  }

  const patch: Partial<typeof gymStaff.$inferInsert> = { updatedAt: new Date() };
  if (input.fullName !== undefined) patch.fullName = input.fullName;
  if (input.email !== undefined) patch.email = input.email;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.role !== undefined) patch.role = input.role;
  if (input.status !== undefined) patch.status = input.status;
  if (input.specializations !== undefined) patch.specializations = input.specializations;
  if (input.bio !== undefined) patch.bio = input.bio;

  const [row] = await tx.update(gymStaff).set(patch).where(eq(gymStaff.id, staffId)).returning();
  await audit(tx, ctx, "staff.update", "gym_staff", staffId, {
    role: input.role,
    status: input.status,
  });
  return row!;
}

export async function regenerateStaffInvite(tx: Tx, ctx: GymContext, staffId: string) {
  requirePermission(ctx, "staff.manage");
  const current = await getStaff(tx, ctx, staffId);
  assertCanManageRole(ctx, current.role);
  if (current.userId) throw conflict("This person has already joined.");
  const invite = newInvite();
  await tx
    .update(gymStaff)
    .set({ inviteTokenHash: invite.tokenHash, inviteExpiresAt: invite.expiresAt, status: "invited", updatedAt: new Date() })
    .where(eq(gymStaff.id, staffId));
  await audit(tx, ctx, "staff.invite_regenerate", "gym_staff", staffId);
  return { inviteUrl: inviteUrl(invite.token), expiresAt: invite.expiresAt };
}

/**
 * Creates a one-time password reset link for a staff member's or member's
 * account. Staff share it themselves (e.g. on WhatsApp) — no email/SMS needed.
 */
export async function createPasswordResetLink(
  tx: Tx,
  ctx: GymContext,
  target: { kind: "staff" | "member"; id: string },
) {
  let userId: string | null = null;
  if (target.kind === "staff") {
    requirePermission(ctx, "staff.manage");
    const staff = await getStaff(tx, ctx, target.id);
    assertCanManageRole(ctx, staff.role);
    userId = staff.userId;
  } else {
    requirePermission(ctx, "members.manage");
    const [m] = await tx
      .select({ userId: members.userId })
      .from(members)
      .where(and(eq(members.id, target.id), eq(members.gymId, ctx.gym.id)));
    if (!m) throw notFound("Member not found.");
    userId = m.userId;
  }
  if (!userId) throw badRequest("This person hasn't created an account yet. Share their invite link instead.");
  if (userId === ctx.user.id) throw badRequest("Use 'Change password' in your account settings instead.");

  const token = randomToken();
  await tx.insert(passwordResetTokens).values({
    gymId: ctx.gym.id,
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + RESET_TTL_HOURS * 3_600_000),
    createdByUserId: ctx.user.id,
  });
  await audit(tx, ctx, "auth.reset_link", target.kind === "staff" ? "gym_staff" : "member", target.id);
  return { url: new URL(`/reset/${token}`, env().APP_URL).toString(), expiresInHours: RESET_TTL_HOURS };
}
