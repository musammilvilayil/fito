import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { deriveRiskTags, excludedRiskTags, LEVELS_FOR } from "@/shared/exercise-safety";
import type { customExerciseSchema, exerciseQuery } from "@/shared/schemas/workout";
import type { ExerciseMeta } from "@/shared/workout-rules";
import { requirePermission, type GymContext } from "../../auth/context";
import { exercises } from "../../db/schema";
import type { Tx } from "../../db/tx";
import { env } from "../../env";
import { forbidden } from "../../errors";
import { audit } from "../audit";

export function mediaUrl(path: string): string {
  return /^https?:\/\//.test(path) ? path : `${env().EXERCISE_MEDIA_BASE_URL}${path}`;
}

const visible = (ctx: GymContext) => and(eq(exercises.isActive, true), or(isNull(exercises.gymId), eq(exercises.gymId, ctx.gym.id)));

function assertCanBrowse(ctx: GymContext) {
  if (!ctx.permissions.has("workouts.manage") && !ctx.memberId) throw forbidden();
}

export async function searchExercises(tx: Tx, ctx: GymContext, q: z.output<typeof exerciseQuery>) {
  assertCanBrowse(ctx);
  const conds = [visible(ctx)];
  if (q.q) conds.push(sql`${exercises.name} ilike ${`%${q.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`}`);
  if (q.muscle) conds.push(sql`${q.muscle} = any(${exercises.primaryMuscles})`);
  if (q.equipment) conds.push(eq(exercises.equipment, q.equipment));
  if (q.level) conds.push(eq(exercises.level, q.level));
  const where = and(...conds);
  const rows = await tx
    .select()
    .from(exercises)
    .where(where)
    .orderBy(sql`${exercises.gymId} is null`, asc(exercises.name))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  const [{ n } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(exercises).where(where);
  return {
    items: rows.map((r) => ({ ...r, images: r.images.map(mediaUrl), custom: r.gymId !== null })),
    total: n,
    page: q.page,
    pageSize: q.pageSize,
  };
}

/** Metadata for the given ids (used to validate and display plans). */
export async function exerciseMap(tx: Tx, ctx: GymContext, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map<string, ExerciseMeta & { images: string[]; instructions: string[]; videoUrl: string | null }>();
  const rows = await tx.select().from(exercises).where(and(inArray(exercises.id, unique), or(isNull(exercises.gymId), eq(exercises.gymId, ctx.gym.id))));
  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        name: r.name,
        level: r.level,
        equipment: r.equipment,
        category: r.category,
        mechanic: r.mechanic,
        primaryMuscles: r.primaryMuscles,
        riskTags: r.riskTags,
        images: r.images.map(mediaUrl),
        instructions: r.instructions,
        videoUrl: r.videoUrl,
      },
    ]),
  );
}

/**
 * Exercises suitable for a member: the gym has the equipment, the level is
 * appropriate and nothing conflicts with reported limitations.
 */
export async function candidatesFor(
  tx: Tx,
  ctx: GymContext,
  profile: { experienceLevel: string; limitationTags: readonly string[] },
): Promise<ExerciseMeta[]> {
  const levels = LEVELS_FOR[profile.experienceLevel] ?? LEVELS_FOR.beginner!;
  const equipment = ctx.gym.settings.availableEquipment ?? [];
  const rows = await tx
    .select({
      id: exercises.id,
      name: exercises.name,
      level: exercises.level,
      equipment: exercises.equipment,
      category: exercises.category,
      mechanic: exercises.mechanic,
      primaryMuscles: exercises.primaryMuscles,
      riskTags: exercises.riskTags,
    })
    .from(exercises)
    .where(
      and(
        visible(ctx),
        inArray(exercises.level, levels),
        inArray(exercises.category, ["strength", "cardio", "stretching", "plyometrics", "powerlifting"]),
        equipment.length > 0 ? or(eq(exercises.equipment, "body only"), inArray(exercises.equipment, [...equipment])) : sql`true`,
      ),
    )
    .orderBy(asc(exercises.name));
  const excluded = excludedRiskTags(profile.limitationTags);
  return rows.filter((r) => !r.riskTags.some((t) => excluded.has(t as never)));
}

export async function createCustomExercise(tx: Tx, ctx: GymContext, input: z.output<typeof customExerciseSchema>) {
  requirePermission(ctx, "exercises.manage");
  const id = `gym-${randomUUID()}`;
  const [row] = await tx
    .insert(exercises)
    .values({
      id,
      gymId: ctx.gym.id,
      name: input.name,
      category: input.category,
      equipment: input.equipment.toLowerCase(),
      level: input.level,
      mechanic: null,
      force: null,
      primaryMuscles: input.primaryMuscles,
      instructions: input.instructions ? input.instructions.split(/\n+/).map((s) => s.trim()).filter(Boolean) : [],
      videoUrl: input.videoUrl,
      riskTags: deriveRiskTags({ ...input, equipment: input.equipment.toLowerCase(), primaryMuscles: input.primaryMuscles }),
    })
    .returning();
  await audit(tx, ctx, "exercise.create", "exercise", id, { name: input.name });
  return row!;
}

export async function equipmentList(tx: Tx, ctx: GymContext) {
  const rows = await tx.selectDistinct({ equipment: exercises.equipment }).from(exercises).where(visible(ctx)).orderBy(asc(exercises.equipment));
  return rows.map((r) => r.equipment);
}
