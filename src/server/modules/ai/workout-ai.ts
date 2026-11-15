import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { ExerciseMeta } from "@/shared/workout-rules";
import { env } from "../../env";

/**
 * AI workout drafting. Business code depends on the WorkoutAI interface, so
 * the provider can be swapped without touching plan logic. The API key is
 * read from the server environment only.
 */
export type WorkoutAIInput = {
  goal: string;
  level: string;
  daysPerWeek: number;
  sessionMinutes: number;
  age: number | null;
  gender: string | null;
  preferences: string | null;
  limitations: string | null;
  limitationTags: string[];
  trainerInstructions: string | null;
  candidates: ExerciseMeta[];
  /** Validation problems from a previous attempt, so the model can fix them. */
  previousErrors?: string[];
};

export type WorkoutAIResult = {
  draft: AiPlan;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export interface WorkoutAI {
  readonly provider: string;
  readonly model: string;
  draftPlan(input: WorkoutAIInput): Promise<WorkoutAIResult>;
}

/**
 * Shape the model must return. Kept simple (types only) because structured
 * outputs support a subset of JSON Schema; ranges and formats are enforced
 * afterwards by planContentSchema and checkPlan().
 */
export const aiPlanSchema = z.object({
  name: z.string(),
  rationale: z.string(),
  warmup: z.string(),
  cooldown: z.string(),
  notes: z.string(),
  days: z.array(
    z.object({
      title: z.string(),
      focus: z.string(),
      weekday: z.number().int(),
      exercises: z.array(
        z.object({
          exerciseId: z.string(),
          sets: z.number().int(),
          reps: z.string(),
          restSeconds: z.number().int(),
          notes: z.string(),
        }),
      ),
    }),
  ),
});
export type AiPlan = z.infer<typeof aiPlanSchema>;

export class AiUnavailableError extends Error {}
export class AiRefusedError extends Error {}

const SYSTEM = `You draft weekly gym workout plans for certified trainers at gyms in India. A trainer reviews, edits and approves every plan before the member sees it.

Rules:
- Use ONLY exerciseId values from the exercise library in the request. Never invent ids.
- Create exactly the requested number of training days. weekday is 0=Monday … 6=Sunday; spread days sensibly with rest between hard sessions.
- Match volume to experience: beginners 4-6 exercises per session and mostly 2-3 sets; intermediate 5-7 exercises; advanced up to 8.
- Keep each session within the member's available minutes (about 40 seconds per set plus the rest you prescribe, plus a minute per exercise to set up).
- reps is a string like "8-12", "10", "30s", "10min" or "AMRAP". restSeconds is 0-300.
- Respect reported limitations conservatively: the library is already filtered, but prefer stable, machine or supported variations when limitations exist.
- Order each day: big compound movements first, then accessories, then core or conditioning.
- Write short practical notes (form cues) in English. No medical advice or diagnosis.
- rationale: 2-3 sentences for the trainer explaining the split and progression.`;

function libraryText(candidates: ExerciseMeta[]): string {
  return candidates
    .map((c) => `${c.id} | ${c.name} | ${c.primaryMuscles.join(", ")} | ${c.equipment} | ${c.level}${c.mechanic ? ` | ${c.mechanic}` : ""}`)
    .join("\n");
}

export function buildUserPrompt(input: WorkoutAIInput): string {
  const lines = [
    "Member profile (anonymised):",
    `- Goal: ${input.goal}`,
    `- Experience: ${input.level}`,
    `- Training days per week: ${input.daysPerWeek}`,
    `- Minutes per session: ${input.sessionMinutes}`,
    input.age ? `- Age: ${input.age}` : null,
    input.gender ? `- Gender: ${input.gender}` : null,
    input.limitationTags.length ? `- Reported limitations: ${input.limitationTags.join(", ")}` : "- Reported limitations: none",
    input.limitations ? `- Member's own words about limitations: """${input.limitations}"""` : null,
    input.preferences ? `- Preferences: """${input.preferences}"""` : null,
    input.trainerInstructions ? `\nTrainer's instructions: """${input.trainerInstructions}"""` : null,
    input.previousErrors?.length
      ? `\nYour previous draft had these problems. Fix all of them:\n${input.previousErrors.map((e) => `- ${e}`).join("\n")}`
      : null,
    `\nExercise library (id | name | primary muscles | equipment | level | mechanic):\n${libraryText(input.candidates)}`,
  ];
  return lines.filter(Boolean).join("\n");
}

class ClaudeWorkoutAI implements WorkoutAI {
  readonly provider = "anthropic";
  private client: Anthropic;
  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey, timeout: 90_000, maxRetries: 1 });
  }

  async draftPlan(input: WorkoutAIInput): Promise<WorkoutAIResult> {
    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: "user", content: buildUserPrompt(input) }],
      output_config: { format: betaZodOutputFormat(aiPlanSchema), effort: "medium" },
      // If the model declines, the API retries on a fallback model in the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (response.stop_reason === "refusal") throw new AiRefusedError("The AI declined to draft this plan.");
    if (!response.parsed_output) throw new Error(`AI returned no structured plan (stop reason: ${response.stop_reason}).`);
    return {
      draft: response.parsed_output,
      model: response.model,
      inputTokens: response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0),
      outputTokens: response.usage.output_tokens,
    };
  }
}

let override: WorkoutAI | null | undefined;
/** Test hook: replace the provider (pass null to simulate "not configured"). */
export function setWorkoutAIForTests(ai: WorkoutAI | null | undefined) {
  override = ai;
}

/** The configured provider, or null when no API key is set. */
export function workoutAI(): WorkoutAI | null {
  if (override !== undefined) return override;
  const key = env().ANTHROPIC_API_KEY;
  return key ? new ClaudeWorkoutAI(key, env().AI_MODEL) : null;
}

/** USD per million tokens (input, output). Used for cost tracking only. */
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-fable-5-2": [8, 40],
};

/** Estimated cost in micro-USD (1e-6 USD). Unknown models are priced like Opus. */
export function costMicroUsd(model: string, inputTokens: number, outputTokens: number): number {
  const [pin, pout] = PRICES[model] ?? PRICES["claude-opus-5-5"]!;
  return Math.round(inputTokens * pin + outputTokens * pout);
}
