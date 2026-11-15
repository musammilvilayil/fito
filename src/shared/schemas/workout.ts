import { z } from "zod";
import { LIMITATION_TAGS } from "../exercise-safety";
import { optionalText, requiredText } from "./common";

export const FITNESS_GOALS = ["weight_loss", "muscle_gain", "strength", "general_fitness", "endurance", "body_recomposition"] as const;
export type FitnessGoal = (typeof FITNESS_GOALS)[number];
export const GOAL_LABELS: Record<FitnessGoal, string> = {
  weight_loss: "Weight loss",
  muscle_gain: "Muscle gain",
  strength: "Strength",
  general_fitness: "General fitness",
  endurance: "Endurance",
  body_recomposition: "Body recomposition",
};

export const EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];
export const LEVEL_LABELS: Record<ExperienceLevel, string> = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** One exercise inside a workout day. */
export const planExerciseSchema = z.object({
  exerciseId: z.string().min(1).max(120),
  sets: z.number().int().min(1).max(10),
  reps: z
    .string()
    .trim()
    .regex(/^(\d{1,3}(-\d{1,3})?|\d{1,3}\s?(s|sec|min)|AMRAP)$/i, "Reps like 10, 8-12, 30s or AMRAP"),
  restSeconds: z.number().int().min(0).max(600),
  notes: z.string().trim().max(300).optional().default(""),
});

export const planDaySchema = z.object({
  key: z.string().min(1).max(20),
  title: z.string().trim().min(1).max(60),
  focus: z.string().trim().max(120).optional().default(""),
  weekday: z.number().int().min(0).max(6).nullable().optional().default(null),
  exercises: z.array(planExerciseSchema).min(1, "Each day needs at least one exercise").max(15),
});

export const planContentSchema = z.object({
  days: z.array(planDaySchema).min(1).max(7),
  warmup: z.string().trim().max(500).optional().default(""),
  cooldown: z.string().trim().max(500).optional().default(""),
  notes: z.string().trim().max(1500).optional().default(""),
});
export type PlanContent = z.output<typeof planContentSchema>;
export type PlanDay = PlanContent["days"][number];
export type PlanExercise = PlanDay["exercises"][number];

/** Fitness profile used as AI/template input (edited by staff or the member). */
export const fitnessProfileSchema = z.object({
  fitnessGoal: z.enum(FITNESS_GOALS),
  experienceLevel: z.enum(EXPERIENCE_LEVELS),
  trainingDaysPerWeek: z.coerce.number().int().min(1).max(7),
  sessionMinutes: z.coerce.number().int().min(20).max(180),
  exercisePreferences: optionalText(500),
  limitations: optionalText(500),
  limitationTags: z.array(z.enum(LIMITATION_TAGS)).default([]),
});
export type FitnessProfileInput = z.input<typeof fitnessProfileSchema>;

export const HEALTH_QUESTIONS = [
  { key: "heartCondition", label: "Has a doctor said you have a heart condition?" },
  { key: "chestPain", label: "Do you feel chest pain during physical activity?" },
  { key: "dizziness", label: "Do you lose balance from dizziness or ever lose consciousness?" },
  { key: "boneOrJointProblem", label: "Do you have a bone or joint problem that exercise could make worse?" },
  { key: "bloodPressureMedication", label: "Are you taking medicine for blood pressure or a heart condition?" },
  { key: "pregnant", label: "Are you pregnant or recently gave birth?" },
  { key: "otherReason", label: "Is there any other reason you shouldn't do physical activity?" },
] as const;

export const healthScreeningSchema = z.object(
  Object.fromEntries(HEALTH_QUESTIONS.map((q) => [q.key, z.boolean()])) as Record<(typeof HEALTH_QUESTIONS)[number]["key"], z.ZodBoolean>,
);

export const clearanceSchema = z.object({ note: requiredText("Clearance note", 300) });

export const generatePlanSchema = z.object({
  memberId: z.uuid(),
  mode: z.enum(["ai", "template", "blank"]),
  /** Extra guidance for the AI from the trainer (optional). */
  instructions: optionalText(500),
  /** Override the profile's equipment with the gym's list (default true). */
});
export type GeneratePlanInput = z.input<typeof generatePlanSchema>;

export const planUpdateSchema = z.object({
  name: requiredText("Plan name", 80),
  goal: z.enum(FITNESS_GOALS).nullable().optional(),
  content: planContentSchema,
  changeSummary: optionalText(200),
});

export const rejectPlanSchema = z.object({ reason: requiredText("Reason", 300) });

export const customExerciseSchema = z.object({
  name: requiredText("Name", 80),
  category: z.enum(["strength", "cardio", "stretching", "plyometrics"]),
  equipment: requiredText("Equipment", 40),
  level: z.enum(["beginner", "intermediate", "expert"]),
  primaryMuscles: z.array(z.string().trim().min(1).max(30)).min(1, "Choose at least one muscle").max(4),
  instructions: optionalText(2000),
  videoUrl: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(v), "Use a YouTube link (https://youtube.com/… or https://youtu.be/…)"),
});

export const MUSCLES = [
  "chest",
  "shoulders",
  "triceps",
  "biceps",
  "forearms",
  "lats",
  "middle back",
  "lower back",
  "traps",
  "abdominals",
  "quadriceps",
  "hamstrings",
  "glutes",
  "calves",
  "adductors",
  "abductors",
  "neck",
] as const;

export const exerciseQuery = z.object({
  q: z.string().trim().max(60).optional(),
  muscle: z.string().trim().max(30).optional(),
  equipment: z.string().trim().max(30).optional(),
  level: z.enum(["beginner", "intermediate", "expert"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});

/** YouTube URL -> embeddable URL (privacy-enhanced domain). */
export function youtubeEmbed(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /(?:youtu\.be\/|v=|shorts\/|embed\/)([A-Za-z0-9_-]{11})/.exec(url);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null;
}
