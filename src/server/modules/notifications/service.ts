import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { GymContext } from "../../auth/context";
import { gymStaff, members, notifications } from "../../db/schema";
import type { Tx } from "../../db/tx";
import { sequential } from "@/server/db/tx";

type NewNotification = { userId: string; type: string; title: string; body?: string | null; link?: string | null };

/**
 * In-app notifications. Delivery channels beyond the app (push, SMS,
 * WhatsApp API) plug in here later; today staff use WhatsApp share links.
 */
export async function notify(tx: Tx, ctx: GymContext, items: NewNotification[]) {
  const rows = items.filter((i) => i.userId && i.userId !== ctx.user.id);
  if (rows.length === 0) return;
  await tx.insert(notifications).values(
    rows.map((i) => ({ gymId: ctx.gym.id, userId: i.userId, type: i.type, title: i.title, body: i.body ?? null, link: i.link ?? null })),
  );
}

async function staffUserId(tx: Tx, ctx: GymContext, staffId: string) {
  const [s] = await tx.select({ userId: gymStaff.userId }).from(gymStaff).where(and(eq(gymStaff.id, staffId), eq(gymStaff.gymId, ctx.gym.id)));
  return s?.userId ?? null;
}

async function memberInfo(tx: Tx, ctx: GymContext, memberId: string) {
  const [m] = await tx
    .select({ userId: members.userId, fullName: members.fullName })
    .from(members)
    .where(and(eq(members.id, memberId), eq(members.gymId, ctx.gym.id)));
  return m ?? null;
}

export async function notifyTrainerAssigned(tx: Tx, ctx: GymContext, memberId: string, trainerStaffId: string) {
  const [trainerUser, member] = await sequential(() => staffUserId(tx, ctx, trainerStaffId), () => memberInfo(tx, ctx, memberId));
  if (!member) return;
  const [trainer] = await tx.select({ fullName: gymStaff.fullName }).from(gymStaff).where(eq(gymStaff.id, trainerStaffId));
  const items: NewNotification[] = [];
  if (trainerUser) {
    items.push({
      userId: trainerUser,
      type: "trainer.assigned",
      title: `New member assigned: ${member.fullName}`,
      link: `/members/${memberId}`,
    });
  }
  if (member.userId && trainer) {
    items.push({
      userId: member.userId,
      type: "trainer.assigned",
      title: `${trainer.fullName} is now your trainer`,
      link: "/me",
    });
  }
  await notify(tx, ctx, items);
}

export async function notifyPlanSubmitted(tx: Tx, ctx: GymContext, planId: string, memberName: string, trainerStaffId: string | null) {
  if (!trainerStaffId) return;
  const userId = await staffUserId(tx, ctx, trainerStaffId);
  if (!userId) return;
  await notify(tx, ctx, [
    { userId, type: "plan.review", title: `Workout plan for ${memberName} needs your review`, link: `/workouts/${planId}` },
  ]);
}

export async function notifyPlanApproved(tx: Tx, ctx: GymContext, memberId: string, planName: string) {
  const member = await memberInfo(tx, ctx, memberId);
  if (!member?.userId) return;
  await notify(tx, ctx, [
    { userId: member.userId, type: "plan.approved", title: `Your new workout plan is ready: ${planName}`, link: "/me/workouts" },
  ]);
}

export async function listNotifications(tx: Tx, ctx: GymContext, limit = 30) {
  const items = await tx
    .select()
    .from(notifications)
    .where(and(eq(notifications.gymId, ctx.gym.id), eq(notifications.userId, ctx.user.id)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  const [unread] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.gymId, ctx.gym.id), eq(notifications.userId, ctx.user.id), isNull(notifications.readAt)));
  return { items, unread: unread?.n ?? 0 };
}

export async function markRead(tx: Tx, ctx: GymContext, ids: string[] | "all") {
  const base = and(eq(notifications.gymId, ctx.gym.id), eq(notifications.userId, ctx.user.id), isNull(notifications.readAt));
  await tx
    .update(notifications)
    .set({ readAt: new Date() })
    .where(ids === "all" ? base : and(base, inArray(notifications.id, ids)));
}
