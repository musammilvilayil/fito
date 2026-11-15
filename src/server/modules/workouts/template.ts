import type { ExerciseMeta } from "@/shared/workout-rules";
import { estimateDayMinutes } from "@/shared/workout-rules";
import type { FitnessGoal, PlanContent, PlanExercise } from "@/shared/schemas/workout";

/**
 * Deterministic, rule-based plan generator. Used when AI is not configured,
 * over its monthly quota, or its output fails validation. It only picks from
 * the candidate list (already filtered for equipment, level and limitations).
 */
type Slot = { muscles: string[]; kind: "compound" | "isolation" | "cardio" | "stretch" };

const C = (...muscles: string[]): Slot => ({ muscles, kind: "compound" });
const I = (...muscles: string[]): Slot => ({ muscles, kind: "isolation" });

const DAY_TYPES: Record<string, { title: string; focus: string; slots: Slot[] }> = {
  fullA: { title: "Full body A", focus: "Legs, push, pull, core", slots: [C("quadriceps"), C("chest"), C("lats", "middle back"), I("hamstrings", "glutes"), I("shoulders"), I("abdominals")] },
  fullB: { title: "Full body B", focus: "Hinge, press, row, core", slots: [C("hamstrings", "glutes"), C("shoulders"), C("middle back", "lats"), I("quadriceps"), I("biceps", "triceps"), I("abdominals")] },
  upper: { title: "Upper body", focus: "Chest, back, shoulders, arms", slots: [C("chest"), C("lats", "middle back"), C("shoulders"), I("middle back", "lats"), I("biceps"), I("triceps")] },
  lower: { title: "Lower body", focus: "Quads, hamstrings, glutes, calves", slots: [C("quadriceps"), C("hamstrings", "glutes"), I("quadriceps"), I("hamstrings"), I("calves"), I("abdominals")] },
  push: { title: "Push", focus: "Chest, shoulders, triceps", slots: [C("chest"), C("shoulders"), I("chest"), I("shoulders"), I("triceps"), I("triceps")] },
  pull: { title: "Pull", focus: "Back, biceps", slots: [C("lats"), C("middle back"), I("lats", "middle back"), I("traps", "middle back"), I("biceps"), I("biceps", "forearms")] },
  legs: { title: "Legs", focus: "Quads, hamstrings, glutes, calves", slots: [C("quadriceps"), C("hamstrings", "glutes"), I("quadriceps"), I("hamstrings"), I("calves"), I("abdominals")] },
  recovery: { title: "Active recovery", focus: "Light cardio and mobility", slots: [{ muscles: [], kind: "cardio" }, { muscles: [], kind: "stretch" }, { muscles: [], kind: "stretch" }, { muscles: [], kind: "stretch" }] },
};

function split(days: number): string[] {
  switch (days) {
    case 1:
      return ["fullA"];
    case 2:
      return ["fullA", "fullB"];
    case 3:
      return ["fullA", "fullB", "fullA"];
    case 4:
      return ["upper", "lower", "upper", "lower"];
    case 5:
      return ["push", "pull", "legs", "upper", "lower"];
    case 6:
      return ["push", "pull", "legs", "push", "pull", "legs"];
    default:
      return ["push", "pull", "legs", "push", "pull", "legs", "recovery"];
  }
}

/** Spread training days over the week (Mon=0). */
const WEEKDAY_PATTERNS: Record<number, number[]> = {
  1: [0],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 4, 5],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6],
};

function prescription(goal: FitnessGoal, level: string, kind: Slot["kind"]): Omit<PlanExercise, "exerciseId" | "notes"> {
  if (kind === "cardio") return { sets: 1, reps: goal === "weight_loss" || goal === "endurance" ? "20min" : "15min", restSeconds: 0 };
  if (kind === "stretch") return { sets: 2, reps: "30s", restSeconds: 15 };
  const compound = kind === "compound";
  const beginner = level === "beginner";
  switch (goal) {
    case "strength":
      return compound ? { sets: beginner ? 3 : 4, reps: beginner ? "6-8" : "4-6", restSeconds: 150 } : { sets: 3, reps: "8-10", restSeconds: 90 };
    case "muscle_gain":
    case "body_recomposition":
      return compound ? { sets: beginner ? 3 : 4, reps: "8-12", restSeconds: 90 } : { sets: 3, reps: "10-12", restSeconds: 60 };
    case "weight_loss":
      return { sets: 3, reps: "12-15", restSeconds: 45 };
    case "endurance":
      return { sets: beginner ? 2 : 3, reps: "15-20", restSeconds: 30 };
    default:
      return { sets: 3, reps: "10-12", restSeconds: 60 };
  }
}

/** Small deterministic hash so different members get varied (but stable) picks. */
function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

const COMMON_EQUIPMENT = ["dumbbell", "barbell", "machine", "cable", "body only"];

function pick(candidates: ExerciseMeta[], slot: Slot, used: Set<string>, seed: string): ExerciseMeta | null {
  let pool: ExerciseMeta[];
  if (slot.kind === "cardio") pool = candidates.filter((c) => c.category === "cardio");
  else if (slot.kind === "stretch") pool = candidates.filter((c) => c.category === "stretching");
  else {
    pool = candidates.filter((c) => c.category === "strength" && c.primaryMuscles.some((m) => slot.muscles.includes(m)));
    const preferred = pool.filter((c) => (slot.kind === "compound" ? c.mechanic === "compound" : c.mechanic !== "compound"));
    if (preferred.length > 0) pool = preferred;
  }
  const fresh = pool.filter((c) => !used.has(c.id));
  if (fresh.length > 0) pool = fresh;
  if (pool.length === 0) return null;
  // Prefer common equipment and the slot's first muscle; then vary by member.
  const ranked = [...pool].sort((a, b) => {
    const score = (c: ExerciseMeta) =>
      (COMMON_EQUIPMENT.includes(c.equipment) ? 0 : 2) + (slot.muscles[0] && c.primaryMuscles[0] === slot.muscles[0] ? 0 : 1);
    return score(a) - score(b) || a.id.localeCompare(b.id);
  });
  const top = ranked.slice(0, Math.min(6, ranked.length));
  return top[hash(seed) % top.length]!;
}

export function generateTemplatePlan(input: {
  seed: string;
  goal: FitnessGoal;
  level: string;
  daysPerWeek: number;
  sessionMinutes: number;
  candidates: ExerciseMeta[];
}): { name: string; content: PlanContent } {
  const used = new Set<string>();
  const types = split(input.daysPerWeek);
  const weekdays = WEEKDAY_PATTERNS[types.length] ?? WEEKDAY_PATTERNS[3]!;
  const days = types.map((type, i) => {
    const t = DAY_TYPES[type]!;
    const exercises: PlanExercise[] = [];
    t.slots.forEach((slot, s) => {
      const ex = pick(input.candidates, slot, used, `${input.seed}:${i}:${s}`);
      if (!ex) return;
      used.add(ex.id);
      exercises.push({ exerciseId: ex.id, notes: "", ...prescription(input.goal, input.level, slot.kind) });
    });
    if ((input.goal === "weight_loss" || input.goal === "endurance") && type !== "recovery") {
      const cardio = pick(input.candidates, { muscles: [], kind: "cardio" }, used, `${input.seed}:${i}:cardio`);
      if (cardio) exercises.push({ exerciseId: cardio.id, notes: "Steady pace finisher", sets: 1, reps: "10min", restSeconds: 0 });
    }
    const day = { key: `day${i + 1}`, title: t.title, focus: t.focus, weekday: weekdays[i] ?? null, exercises };
    // Trim isolation work until the session fits the member's time.
    while (day.exercises.length > 3 && estimateDayMinutes(day) > input.sessionMinutes) day.exercises.splice(day.exercises.length - 2, 1);
    return day;
  });
  const goalName: Record<FitnessGoal, string> = {
    weight_loss: "Fat loss",
    muscle_gain: "Muscle building",
    strength: "Strength",
    general_fitness: "General fitness",
    endurance: "Endurance",
    body_recomposition: "Recomposition",
  };
  return {
    name: `${goalName[input.goal]} · ${input.daysPerWeek} days`,
    content: {
      days: days.filter((d) => d.exercises.length > 0),
      warmup: "5–10 min easy cardio, then dynamic mobility for the muscles you'll train.",
      cooldown: "5 min walk and light stretching.",
      notes: "Increase weight when you complete the top of the rep range on every set with good form.",
    },
  };
}
