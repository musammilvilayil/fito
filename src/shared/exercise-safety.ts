/**
 * Exercise safety rules used by workout generation (AI and templates) and
 * by the validator that checks every plan before a trainer sees it.
 *
 * These are conservative screening rules, not medical advice: they keep
 * obviously unsuitable movements out of a draft. Trainers review every plan.
 */

export const LIMITATION_TAGS = [
  "knee",
  "lower_back",
  "shoulder",
  "wrist",
  "neck",
  "high_blood_pressure",
  "pregnancy",
  "heart_condition",
] as const;
export type LimitationTag = (typeof LIMITATION_TAGS)[number];

export const LIMITATION_LABELS: Record<LimitationTag, string> = {
  knee: "Knee pain / injury",
  lower_back: "Lower back pain / injury",
  shoulder: "Shoulder pain / injury",
  wrist: "Wrist pain / injury",
  neck: "Neck pain / injury",
  high_blood_pressure: "High blood pressure",
  pregnancy: "Pregnancy",
  heart_condition: "Heart condition",
};

export const RISK_TAGS = ["high_impact", "deep_knee", "spinal_load", "overhead", "shoulder_load", "wrist_load", "neck_load", "max_effort"] as const;
export type RiskTag = (typeof RISK_TAGS)[number];

/** Movements excluded for each reported limitation. */
export const LIMITATION_EXCLUDES: Record<LimitationTag, RiskTag[]> = {
  knee: ["high_impact", "deep_knee"],
  lower_back: ["spinal_load", "high_impact"],
  shoulder: ["overhead", "shoulder_load"],
  wrist: ["wrist_load"],
  neck: ["neck_load", "overhead"],
  high_blood_pressure: ["max_effort", "high_impact"],
  pregnancy: ["high_impact", "spinal_load", "max_effort"],
  heart_condition: ["high_impact", "max_effort"],
};

/** Limitations that need a trainer/doctor clearance before any plan is generated. */
export const CLEARANCE_REQUIRED: ReadonlySet<LimitationTag> = new Set(["pregnancy", "heart_condition"]);

export function excludedRiskTags(limitations: readonly string[]): Set<RiskTag> {
  const out = new Set<RiskTag>();
  for (const l of limitations) for (const t of LIMITATION_EXCLUDES[l as LimitationTag] ?? []) out.add(t);
  return out;
}

const has = (name: string, words: string[]) => words.some((w) => name.includes(w));

/** Derives risk tags from an exercise's name and metadata (used when seeding and for custom exercises). */
export function deriveRiskTags(e: {
  name: string;
  category: string;
  equipment: string;
  level: string;
  primaryMuscles: string[];
}): RiskTag[] {
  const n = e.name.toLowerCase();
  const tags = new Set<RiskTag>();
  if (e.category === "plyometrics" || has(n, ["jump", "burpee", "sprint", "hop", "bound", "skip", "jumping jack"])) tags.add("high_impact");
  if (has(n, ["squat", "lunge", "pistol", "leg press", "hack", "sissy", "split squat", "step-up", "step up"])) tags.add("deep_knee");
  if (
    e.category === "powerlifting" ||
    e.category === "olympic weightlifting" ||
    e.category === "strongman" ||
    has(n, ["deadlift", "good morning", "bent over", "bent-over", "t-bar", "clean", "snatch", "hyperextension"]) ||
    (e.equipment === "barbell" && has(n, ["squat", "row"])) ||
    e.primaryMuscles.includes("lower back")
  ) {
    tags.add("spinal_load");
  }
  if (has(n, ["overhead", "military", "shoulder press", "push press", "jerk", "snatch", "handstand", "arnold", "behind the neck", "behind-the-neck"])) tags.add("overhead");
  if (has(n, ["bench press", "dip", "upright row", "behind the neck", "fly", "flye", "pullover", "push-up", "pushup"]) || (e.primaryMuscles.includes("shoulders") && e.category === "strength")) {
    tags.add("shoulder_load");
  }
  if (has(n, ["push-up", "pushup", "plank", "handstand", "front squat", "wrist", "clean", "mountain climber", "bear crawl"])) tags.add("wrist_load");
  if (e.primaryMuscles.includes("neck") || has(n, ["neck", "shrug", "behind the neck"])) tags.add("neck_load");
  if (e.level === "expert" || e.category === "powerlifting" || e.category === "strongman" || e.category === "olympic weightlifting") tags.add("max_effort");
  return [...tags];
}

/** Experience levels allowed per member level (beginners never get expert movements). */
export const LEVELS_FOR: Record<string, string[]> = {
  beginner: ["beginner"],
  intermediate: ["beginner", "intermediate"],
  advanced: ["beginner", "intermediate", "expert"],
};
