import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { z } from "zod";
import { addDays, type ISODate } from "@/shared/dates";
import type { progressEntrySchema, workoutLogSchema } from "@/shared/schemas/workout";
import type { GymContext } from "../../auth/context";
import { progressEntries, workoutLogs } from "../../db/schema";
import type { Tx } from "../../db/tx";
import { badRequest, notFound } from "../../errors";
import { audit } from "../audit";
import { getMember, gymToday } from "../members/service";
import { assertCanCoach, currentContent, loadPlan } from "./service";

/**
 * Workout logs and body progress. Members record their own; staff who coach
 * the member (assigned trainer, or managers/owners) can read and add too.
 */

const LOG_BACKFILL_DAYS = 7;
const PROGRESS_BACKFILL_DAYS = 365;

function checkDate(value: ISODate | null, today: ISODate, backDays: number, label: string): ISODate {
  const date = value ?? today;
  if (date > today) throw badRequest(`${label} can't be in the future.`);
  if (date < addDays(today, -backDays)) throw badRequest(`${label} can only be up to ${backDays} days ago.`);
  return date;
}

export async function logWorkout(tx: Tx, ctx: GymContext, memberId: string, input: z.output<typeof workoutLogSchema>) {
  const member = await getMember(tx, ctx, memberId);
  assertCanCoach(ctx, member);
  const plan = await loadPlan(tx, ctx, input.planId);
  if (plan.memberId !== memberId || plan.status !== "active") throw notFound("Active workout plan not found.");

  const content = await currentContent(tx, plan.id, plan.currentVersion);
  const day = content.days.find((d) => d.key === input.dayKey);
  if (!day) throw badRequest("That workout day isn't in the plan.");
  const planned = new Set(day.exercises.map((e) => e.exerciseId));
  const entries = input.entries.filter((e) => planned.has(e.exerciseId));
  if (entries.length !== input.entries.length) throw badRequest("Some exercises aren't part of this workout day.");

  const today = gymToday(ctx);
  const performedOn = checkDate(input.performedOn, today, LOG_BACKFILL_DAYS, "Workout date");
  const values = {
    planVersion: plan.currentVersion,
    entries,
    completedExercises: entries.filter((e) => e.done).length,
    totalExercises: day.exercises.length,
    difficulty: input.difficulty ?? null,
    notes: input.notes,
    updatedAt: new Date(),
  };
  // Logging the same day twice updates that log (ON CONFLICT never aborts the transaction).
  const [row] = await tx
    .insert(workoutLogs)
    .values({ gymId: ctx.gym.id, memberId, planId: plan.id, dayKey: day.key, performedOn, ...values })
    .onConflictDoUpdate({ target: [workoutLogs.memberId, workoutLogs.planId, workoutLogs.dayKey, workoutLogs.performedOn], set: values })
    .returning();
  await audit(tx, ctx, "workout.logged", "member", memberId, { planId: plan.id, dayKey: day.key, performedOn });
  return row!;
}

export async function listWorkoutLogs(tx: Tx, ctx: GymContext, memberId: string, limit = 30) {
  const member = await getMember(tx, ctx, memberId);
  assertCanCoach(ctx, member);
  const rows = await tx
    .select({
      id: workoutLogs.id,
      planId: workoutLogs.planId,
      planName: sql<string>`(select p.name from workout_plans p where p.id = "workout_logs"."plan_id")`,
      dayKey: workoutLogs.dayKey,
      performedOn: workoutLogs.performedOn,
      entries: workoutLogs.entries,
      completedExercises: workoutLogs.completedExercises,
      totalExercises: workoutLogs.totalExercises,
      difficulty: workoutLogs.difficulty,
      notes: workoutLogs.notes,
    })
    .from(workoutLogs)
    .where(and(eq(workoutLogs.gymId, ctx.gym.id), eq(workoutLogs.memberId, memberId)))
    .orderBy(desc(workoutLogs.performedOn), desc(workoutLogs.createdAt))
    .limit(limit);
  const today = gymToday(ctx);
  const [week] = (
    await tx.execute(sql`
      select count(*)::int as n from workout_logs
      where gym_id = ${ctx.gym.id} and member_id = ${memberId} and completed_exercises > 0
        and performed_on >= ${addDays(today, -6)}::date`)
  ).rows as { n: number }[];
  return { logs: rows as (Omit<(typeof rows)[number], "entries"> & { entries: z.output<typeof workoutLogSchema>["entries"] })[], last7Days: week?.n ?? 0 };
}

const MEASUREMENT_KEYS = ["waistCm", "chestCm", "hipsCm", "armCm", "thighCm"] as const;

export async function addProgressEntry(tx: Tx, ctx: GymContext, memberId: string, input: z.output<typeof progressEntrySchema>) {
  const member = await getMember(tx, ctx, memberId);
  assertCanCoach(ctx, member);
  const recordedOn = checkDate(input.recordedOn, gymToday(ctx), PROGRESS_BACKFILL_DAYS, "Date");
  const measurements = Object.fromEntries(MEASUREMENT_KEYS.filter((k) => input[k] !== null).map((k) => [k, input[k] as number]));
  const [row] = await tx
    .insert(progressEntries)
    .values({
      gymId: ctx.gym.id,
      memberId,
      recordedOn,
      weightKg: input.weightKg === null ? null : String(input.weightKg),
      bodyFatPct: input.bodyFatPct === null ? null : String(input.bodyFatPct),
      measurements: Object.keys(measurements).length ? measurements : null,
      notes: input.notes,
      recordedByUserId: ctx.user.id,
    })
    .returning();
  await audit(tx, ctx, "progress.added", "member", memberId, { recordedOn });
  return toProgress(row!);
}

function toProgress(r: typeof progressEntries.$inferSelect) {
  return {
    id: r.id,
    recordedOn: r.recordedOn,
    weightKg: r.weightKg === null ? null : Number(r.weightKg),
    bodyFatPct: r.bodyFatPct === null ? null : Number(r.bodyFatPct),
    measurements: (r.measurements ?? {}) as Partial<Record<(typeof MEASUREMENT_KEYS)[number], number>>,
    notes: r.notes,
    recordedByUserId: r.recordedByUserId,
  };
}
export type ProgressPoint = ReturnType<typeof toProgress>;

export async function listProgress(tx: Tx, ctx: GymContext, memberId: string, sinceDays = 365) {
  const member = await getMember(tx, ctx, memberId);
  assertCanCoach(ctx, member);
  const rows = await tx
    .select()
    .from(progressEntries)
    .where(
      and(
        eq(progressEntries.gymId, ctx.gym.id),
        eq(progressEntries.memberId, memberId),
        gte(progressEntries.recordedOn, addDays(gymToday(ctx), -sinceDays)),
      ),
    )
    .orderBy(progressEntries.recordedOn, progressEntries.createdAt);
  return rows.map(toProgress);
}

export async function deleteProgressEntry(tx: Tx, ctx: GymContext, entryId: string) {
  const [row] = await tx.select().from(progressEntries).where(and(eq(progressEntries.id, entryId), eq(progressEntries.gymId, ctx.gym.id)));
  if (!row) throw notFound("Entry not found.");
  const member = await getMember(tx, ctx, row.memberId).catch(() => null);
  if (!member) throw notFound("Entry not found.");
  assertCanCoach(ctx, member);
  await tx.delete(progressEntries).where(eq(progressEntries.id, entryId));
  await audit(tx, ctx, "progress.deleted", "member", row.memberId, { recordedOn: row.recordedOn });
}
