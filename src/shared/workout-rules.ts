import { excludedRiskTags, LEVELS_FOR, type RiskTag } from "./exercise-safety";
import type { PlanContent } from "./schemas/workout";

export type ExerciseMeta = {
  id: string;
  name: string;
  level: string;
  equipment: string;
  category: string;
  mechanic: string | null;
  primaryMuscles: string[];
  riskTags: string[];
};

export type PlanCheckContext = {
  exercises: ReadonlyMap<string, ExerciseMeta>;
  experienceLevel?: string | null;
  limitationTags?: readonly string[];
  trainingDaysPerWeek?: number | null;
  sessionMinutes?: number | null;
  /** Equipment the gym has; empty = not configured (no check). */
  availableEquipment?: readonly string[];
};

export type PlanIssue = { level: "error" | "warning"; dayKey?: string; exerciseId?: string; message: string };

const RISK_REASON: Record<RiskTag, string> = {
  high_impact: "high-impact",
  deep_knee: "deep knee bending",
  spinal_load: "heavy spinal loading",
  overhead: "overhead pressing",
  shoulder_load: "shoulder-intensive",
  wrist_load: "wrist-loading",
  neck_load: "neck-loading",
  max_effort: "maximal-effort",
};

/** Rough minutes for one session: work ~40s per set, rest as planned, ~1 min to set up each exercise. */
export function estimateDayMinutes(day: PlanContent["days"][number]): number {
  const seconds = day.exercises.reduce((sum, e) => sum + e.sets * (40 + e.restSeconds) + 60, 0);
  return Math.round(seconds / 60);
}

/** Working sets per primary muscle across the week. */
export function weeklySetsByMuscle(content: PlanContent, exercises: ReadonlyMap<string, ExerciseMeta>) {
  const totals = new Map<string, number>();
  for (const day of content.days) {
    for (const e of day.exercises) {
      for (const m of exercises.get(e.exerciseId)?.primaryMuscles ?? []) totals.set(m, (totals.get(m) ?? 0) + e.sets);
    }
  }
  return totals;
}

/**
 * Checks a plan against the exercise library, the member's level and
 * reported limitations, and practical limits. Errors must be fixed (or, for
 * AI output, trigger a retry/fallback). Warnings are shown to the trainer,
 * who must acknowledge them before approving.
 */
export function checkPlan(content: PlanContent, ctx: PlanCheckContext): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const excluded = excludedRiskTags(ctx.limitationTags ?? []);
  const allowedLevels = ctx.experienceLevel ? LEVELS_FOR[ctx.experienceLevel] : undefined;
  const equipment = new Set(ctx.availableEquipment ?? []);

  const keys = new Set<string>();
  for (const day of content.days) {
    if (keys.has(day.key)) issues.push({ level: "error", dayKey: day.key, message: `Two days share the key "${day.key}".` });
    keys.add(day.key);
    const seen = new Set<string>();
    for (const e of day.exercises) {
      const meta = ctx.exercises.get(e.exerciseId);
      if (!meta) {
        issues.push({ level: "error", dayKey: day.key, exerciseId: e.exerciseId, message: `Unknown exercise "${e.exerciseId}" (not in the library).` });
        continue;
      }
      if (seen.has(e.exerciseId)) issues.push({ level: "warning", dayKey: day.key, exerciseId: e.exerciseId, message: `${meta.name} appears twice on ${day.title}.` });
      seen.add(e.exerciseId);
      if (allowedLevels && !allowedLevels.includes(meta.level)) {
        issues.push({ level: "warning", dayKey: day.key, exerciseId: e.exerciseId, message: `${meta.name} is ${meta.level}-level; member is ${ctx.experienceLevel}.` });
      }
      const conflicts = meta.riskTags.filter((t) => excluded.has(t as RiskTag)) as RiskTag[];
      if (conflicts.length > 0) {
        issues.push({
          level: "warning",
          dayKey: day.key,
          exerciseId: e.exerciseId,
          message: `${meta.name} is ${conflicts.map((c) => RISK_REASON[c]).join(", ")}; check against the member's reported limitations.`,
        });
      }
      if (equipment.size > 0 && meta.equipment !== "body only" && !equipment.has(meta.equipment)) {
        issues.push({ level: "warning", dayKey: day.key, exerciseId: e.exerciseId, message: `${meta.name} needs ${meta.equipment}, which isn't in the gym's equipment list.` });
      }
    }
    if (ctx.sessionMinutes) {
      const minutes = estimateDayMinutes(day);
      if (minutes > ctx.sessionMinutes * 1.25) {
        issues.push({ level: "warning", dayKey: day.key, message: `${day.title} takes about ${minutes} min; the member trains ${ctx.sessionMinutes} min.` });
      }
    }
  }

  if (ctx.trainingDaysPerWeek && content.days.length !== ctx.trainingDaysPerWeek) {
    issues.push({ level: "warning", message: `Plan has ${content.days.length} training days; member wants ${ctx.trainingDaysPerWeek} per week.` });
  }
  if (content.days.length === 7) issues.push({ level: "warning", message: "No rest day in the week." });
  for (const [muscle, sets] of weeklySetsByMuscle(content, ctx.exercises)) {
    if (sets > 24) issues.push({ level: "warning", message: `${sets} sets a week for ${muscle} is very high volume.` });
  }
  return issues;
}

/** Stricter view used for AI output: any safety/level/equipment warning counts as a failure. */
export function aiBlockingIssues(issues: PlanIssue[]): PlanIssue[] {
  return issues.filter(
    (i) =>
      i.level === "error" ||
      /level; member is|check against the member's reported limitations|isn't in the gym's equipment list|appears twice/.test(i.message),
  );
}
