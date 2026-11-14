import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { normalizePhone } from "@/shared/phone";
import type { acceptInviteSchema, changePasswordSchema, registerSchema } from "@/shared/schemas/auth";
import { initials, slugify } from "@/shared/text";
import { dummyPasswordHash, hashPassword, hashToken, randomToken, verifyPassword } from "../../auth/crypto";
import { createSession, rateLimit, type SessionInfo } from "../../auth/session";
import { db } from "../../db/client";
import { gymStaff, gyms, members, users } from "../../db/schema";
import { withScope } from "../../db/tx";
import { env } from "../../env";
import { badRequest, conflict, forbidden, notFound, unauthorized, uniqueViolation } from "../../errors";
import { logger } from "../../logger";

type Meta = { ip: string; userAgent: string | null };

const INVALID_LOGIN = "Incorrect email/phone or password.";

function parseIdentifier(identifier: string): { email: string | null; phone: string | null } {
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) return { email: trimmed.toLowerCase(), phone: null };
  return { email: null, phone: normalizePhone(trimmed) };
}

export async function login(input: { identifier: string; password: string }, meta: Meta) {
  const { email, phone } = parseIdentifier(input.identifier);
  await rateLimit(`login:ip:${meta.ip}`, 50, 900);
  await rateLimit(`login:id:${email ?? phone ?? input.identifier.toLowerCase()}`, 10, 900);

  let row: { id: string; password_hash: string | null } | undefined;
  if (email || phone) {
    const result = await db().execute(sql`select * from fito_auth_find_login(${email}, ${phone})`);
    row = result.rows[0] as typeof row;
  }
  // Always run a hash comparison so response time doesn't reveal unknown accounts.
  const ok = await verifyPassword(input.password, row?.password_hash ?? (await dummyPasswordHash()));
  if (!row || !row.password_hash || !ok) throw unauthorized(INVALID_LOGIN);

  const session = await createSession(row.id, meta);
  logger.info("login", { userId: row.id });
  return { ...session, userId: row.id };
}

function contactConflictMessage(constraint: string) {
  if (constraint.includes("email")) return "An account with this email already exists. Sign in instead.";
  if (constraint.includes("phone")) return "An account with this phone number already exists. Sign in instead.";
  return "An account with these details already exists.";
}

/** New gym owner: creates the account, the gym and the owner staff record together. */
export async function registerGymOwner(input: z.output<typeof registerSchema>, meta: Meta) {
  await rateLimit(`register:ip:${meta.ip}`, 10, 3600);
  const requiredCode = env().SIGNUP_ACCESS_CODE;
  if (requiredCode && input.accessCode?.trim() !== requiredCode) {
    throw forbidden("That access code isn't valid. Contact FITO to get one.");
  }

  const userId = randomUUID();
  const gymId = randomUUID();
  const passwordHash = await hashPassword(input.password);
  const slug = `${slugify(input.gymName) || "gym"}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;

  try {
    await withScope({ userId, gymId }, async (tx) => {
      await tx.insert(users).values({
        id: userId,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        passwordHash,
      });
      await tx.insert(gyms).values({
        id: gymId,
        name: input.gymName,
        slug,
        city: input.city,
        phone: input.phone,
        email: input.email,
        receiptPrefix: initials(input.gymName),
        settings: { expiringSoonDays: 7, sessionMinutes: 90, aiMonthlyLimit: env().AI_MONTHLY_LIMIT_DEFAULT },
      });
      await tx.insert(gymStaff).values({
        gymId,
        userId,
        role: "owner",
        status: "active",
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
      });
    });
  } catch (err) {
    const constraint = uniqueViolation(err);
    if (constraint) throw conflict(contactConflictMessage(constraint));
    throw err;
  }

  const session = await createSession(userId, { ...meta, activeGymId: gymId });
  logger.info("gym_registered", { gymId, userId });
  return { ...session, userId, gymId };
}

export type InviteInfo = {
  kind: "staff" | "member";
  recordId: string;
  gymId: string;
  gymName: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: string;
  expired: boolean;
  accepted: boolean;
};

export async function lookupInvite(token: string): Promise<InviteInfo | null> {
  if (!token || token.length < 20) return null;
  const result = await db().execute(sql`select * from fito_lookup_invite(${hashToken(token)})`);
  const row = result.rows[0] as
    | {
        kind: "staff" | "member";
        record_id: string;
        gym_id: string;
        gym_name: string;
        full_name: string;
        email: string | null;
        phone: string | null;
        role: string;
        expires_at: string | Date | null;
        linked_user_id: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    kind: row.kind,
    recordId: row.record_id,
    gymId: row.gym_id,
    gymName: row.gym_name,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    expired: !row.expires_at || new Date(row.expires_at).getTime() < Date.now(),
    accepted: Boolean(row.linked_user_id),
  };
}

/**
 * Accepts a staff or member invite. Signed-in users link their existing
 * account; otherwise a new account is created from the invite details.
 */
export async function acceptInvite(
  input: z.output<typeof acceptInviteSchema>,
  session: SessionInfo | null,
  meta: Meta,
): Promise<{ userId: string; gymId: string; token?: string; expiresAt?: Date }> {
  await rateLimit(`invite:ip:${meta.ip}`, 30, 3600);
  const invite = await lookupInvite(input.token);
  if (!invite) throw notFound("This invite link is not valid. Ask your gym for a new one.");
  if (invite.accepted) throw conflict("This invite has already been used. Sign in instead.");
  if (invite.expired) throw badRequest("This invite link has expired. Ask your gym for a new one.");

  let userId: string;
  let created = false;
  if (session) {
    userId = session.user.id;
  } else {
    if (!input.password) throw badRequest("Choose a password to create your account.");
    if (!invite.email && !invite.phone) throw badRequest("This invite has no email or phone. Ask your gym to update it.");
    userId = randomUUID();
    created = true;
  }

  const tokenHash = hashToken(input.token);
  const passwordHash = created ? await hashPassword(input.password!) : null;
  try {
    await withScope({ userId, gymId: invite.gymId }, async (tx) => {
      if (created) {
        await tx.insert(users).values({
          id: userId,
          fullName: input.fullName?.trim() || invite.fullName,
          email: invite.email,
          phone: invite.phone,
          passwordHash,
        });
      }
      if (invite.kind === "staff") {
        const updated = await tx
          .update(gymStaff)
          .set({ userId, status: "active", inviteTokenHash: null, inviteExpiresAt: null, updatedAt: new Date() })
          .where(and(eq(gymStaff.id, invite.recordId), eq(gymStaff.inviteTokenHash, tokenHash), isNull(gymStaff.userId)))
          .returning({ id: gymStaff.id });
        if (updated.length === 0) throw conflict("This invite has already been used.");
      } else {
        const updated = await tx
          .update(members)
          .set({ userId, inviteTokenHash: null, inviteExpiresAt: null, updatedAt: new Date() })
          .where(and(eq(members.id, invite.recordId), eq(members.inviteTokenHash, tokenHash), isNull(members.userId)))
          .returning({ id: members.id });
        if (updated.length === 0) throw conflict("This invite has already been used.");
      }
    });
  } catch (err) {
    const constraint = uniqueViolation(err);
    if (constraint?.startsWith("users_")) {
      throw conflict(
        "You already have a FITO account with these details. Sign in first, then open this invite link again.",
      );
    }
    if (constraint) throw conflict("Your account is already linked to this gym.");
    throw err;
  }

  if (session) return { userId, gymId: invite.gymId };
  const newSession = await createSession(userId, { ...meta, activeGymId: invite.gymId });
  return { userId, gymId: invite.gymId, ...newSession };
}

export async function resetPassword(token: string, password: string, meta: Meta) {
  await rateLimit(`reset:ip:${meta.ip}`, 20, 3600);
  const passwordHash = await hashPassword(password);
  const result = await db().execute(
    sql`select fito_consume_password_reset(${hashToken(token)}, ${passwordHash}) as user_id`,
  );
  const userId = (result.rows[0] as { user_id: string | null } | undefined)?.user_id;
  if (!userId) throw badRequest("This reset link is invalid or has expired. Ask your gym for a new one.");
  return { userId };
}

export async function changePassword(session: SessionInfo, input: z.output<typeof changePasswordSchema>) {
  await withScope({ userId: session.user.id }, async (tx) => {
    const [user] = await tx
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, session.user.id));
    if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw badRequest("Your current password is incorrect.", { fieldErrors: { currentPassword: "Incorrect password" } });
    }
    await tx
      .update(users)
      .set({ passwordHash: await hashPassword(input.newPassword), updatedAt: new Date() })
      .where(eq(users.id, session.user.id));
  });
}
