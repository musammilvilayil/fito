import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { z } from "zod";
import { todayIn } from "@/shared/dates";
import type { memberSignupSchema } from "@/shared/schemas/auth";
import { hashPassword, randomToken } from "../../auth/crypto";
import { createSession, rateLimit, setActiveGym, type SessionInfo } from "../../auth/session";
import { gyms, gymStaff, members, notifications, users } from "../../db/schema";
import { withScope } from "../../db/tx";
import { conflict, notFound, uniqueViolation } from "../../errors";
import { logger } from "../../logger";
import { audit } from "../audit";
import { newMemberCode } from "../members/service";

type Meta = { ip: string; userAgent: string | null };

/**
 * A person creates their own FITO account (no gym yet). They pick a gym next
 * with joinGym. Gym owners use registerGymOwner instead.
 */
export async function registerMember(input: z.output<typeof memberSignupSchema>, meta: Meta) {
  await rateLimit(`signup:ip:${meta.ip}`, 10, 3600);
  const userId = randomUUID();
  const passwordHash = await hashPassword(input.password);
  try {
    await withScope({ userId }, (tx) =>
      tx.insert(users).values({ id: userId, fullName: input.fullName, phone: input.phone, email: input.email, passwordHash }),
    );
  } catch (err) {
    if (uniqueViolation(err)) throw conflict("An account with this mobile number or email already exists. Sign in instead.");
    throw err;
  }
  const session = await createSession(userId, meta);
  logger.info("member_signed_up", { userId });
  return { ...session, userId };
}

/** Gyms open to app sign-ups, matching a name or city, and which of them the person has already joined. */
export async function searchJoinableGyms(session: SessionInfo, query: string | undefined) {
  const q = (query ?? "").replace(/[%_\\]/g, (c) => `\\${c}`);
  return withScope({ userId: session.user.id }, async (tx) => {
    const found = (await tx.execute(sql`select id, name, city, state from fito_search_gyms(${q}, 20)`)).rows as {
      id: string;
      name: string;
      city: string | null;
      state: string;
    }[];
    const mine = await tx
      .select({ gymId: members.gymId })
      .from(members)
      .where(and(eq(members.userId, session.user.id), isNotNull(members.gymId)));
    const joined = new Set(mine.map((m) => m.gymId));
    return found.map((g) => ({ ...g, joined: joined.has(g.id) }));
  });
}

/**
 * Puts the person on a gym's register as a member (no membership yet; the
 * front desk sells one) and makes it their active gym. Joining a gym they're
 * already in just switches to it.
 *
 * Without phone verification, an existing register entry with the same phone
 * number is never linked automatically: that would let anyone take over
 * someone else's membership, QR code and history. They're asked to get the
 * gym's invite link instead.
 */
export async function joinGym(session: SessionInfo, gymId: string) {
  await rateLimit(`join:user:${session.user.id}`, 10, 3600);
  const user = session.user;
  const result = await withScope({ userId: user.id, gymId }, async (tx) => {
    const [gym] = await tx.select().from(gyms).where(eq(gyms.id, gymId));
    if (!gym || gym.settings.allowMemberSignup === false) {
      throw notFound("This gym isn't taking sign-ups in the app. Ask the front desk for an invite link.");
    }
    const [already] = await tx
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.gymId, gymId), eq(members.userId, user.id)));
    if (already) return { memberId: already.id, gymName: gym.name, created: false };

    if (user.phone) {
      const [onRegister] = await tx
        .select({ id: members.id })
        .from(members)
        .where(and(eq(members.gymId, gymId), eq(members.phone, user.phone)));
      if (onRegister) {
        throw conflict(
          `${gym.name} already has your mobile number on its register. Ask the front desk to send your FITO invite link, so your membership and history stay with you.`,
        );
      }
    }

    const [row] = await tx
      .insert(members)
      .values({
        gymId,
        memberCode: await newMemberCode(tx, gymId),
        fullName: user.fullName,
        phone: user.phone,
        email: user.email,
        joinedOn: todayIn(gym.timezone),
        userId: user.id,
        qrToken: randomToken(18),
        notes: "Joined from the FITO app.",
      })
      .returning({ id: members.id });

    // Let the front desk know someone is waiting for a membership.
    const desk = await tx
      .select({ userId: gymStaff.userId })
      .from(gymStaff)
      .where(and(eq(gymStaff.gymId, gymId), eq(gymStaff.status, "active"), isNotNull(gymStaff.userId), inArray(gymStaff.role, ["owner", "manager", "receptionist"])));
    if (desk.length) {
      await tx.insert(notifications).values(
        desk.map((s) => ({
          gymId,
          userId: s.userId!,
          type: "member.self_join",
          title: `New member joined from the app: ${user.fullName}`,
          body: "They don't have a membership yet.",
          link: `/members/${row!.id}`,
        })),
      );
    }
    await audit(tx, { user, gym } as never, "member.self_join", "member", row!.id);
    return { memberId: row!.id, gymName: gym.name, created: true };
  });
  await setActiveGym(session, gymId);
  return { gymId, ...result };
}
