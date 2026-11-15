import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { sessions, users } from "../db/schema";
import { withScope } from "../db/tx";
import { tooManyRequests } from "../errors";
import { hashToken, randomToken } from "./crypto";

export const SESSION_COOKIE = "fito_session";
export const SESSION_TTL_DAYS = 30;

export type SessionUser = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  isPlatformAdmin: boolean;
};

export type SessionInfo = {
  sessionId: string;
  activeGymId: string | null;
  expiresAt: Date;
  user: SessionUser;
};

export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null; activeGymId?: string | null } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await withScope({ userId }, async (tx) => {
    await tx.insert(sessions).values({
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      ip: meta.ip ?? null,
      activeGymId: meta.activeGymId ?? null,
    });
    await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  });
  return { token, expiresAt };
}

type ResolvedRow = {
  session_id: string;
  user_id: string;
  active_gym_id: string | null;
  expires_at: Date | string;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_platform_admin: boolean;
};

export async function resolveSession(token: string | null | undefined): Promise<SessionInfo | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const result = await db().execute(sql`select * from fito_auth_resolve_session(${hashToken(token)})`);
  const row = result.rows[0] as ResolvedRow | undefined;
  if (!row) return null;
  return {
    sessionId: row.session_id,
    activeGymId: row.active_gym_id,
    expiresAt: new Date(row.expires_at),
    user: {
      id: row.user_id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      isPlatformAdmin: row.is_platform_admin,
    },
  };
}

export async function destroySession(session: SessionInfo) {
  await withScope({ userId: session.user.id }, (tx) =>
    tx.delete(sessions).where(and(eq(sessions.id, session.sessionId), eq(sessions.userId, session.user.id))),
  );
}

export async function setActiveGym(session: SessionInfo, gymId: string) {
  await withScope({ userId: session.user.id }, (tx) =>
    tx.update(sessions).set({ activeGymId: gymId }).where(eq(sessions.id, session.sessionId)),
  );
}

/** Throws 429 when `key` has been hit more than `max` times in the window. */
export async function rateLimit(key: string, max: number, windowSeconds: number) {
  const result = await db().execute(sql`select fito_rate_limit_hit(${key}, ${windowSeconds}, ${max}) as allowed`);
  const allowed = (result.rows[0] as { allowed: boolean } | undefined)?.allowed;
  if (!allowed) throw tooManyRequests();
}
