import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (connection for the fito_app role)"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SIGNUP_ACCESS_CODE: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("claude-opus-5-5"),
  AI_MONTHLY_LIMIT_DEFAULT: z.coerce.number().int().positive().default(100),
  /** In-app assistant. `fake` is a scripted stand-in for automated tests only. */
  ASSISTANT_PROVIDER: z.enum(["anthropic", "fake"]).default("anthropic"),
  ASSISTANT_MODEL: z.string().optional(),
  ASSISTANT_EFFORT: z.enum(["low", "medium", "high"]).default("low"),
  ASSISTANT_MONTHLY_MESSAGES_DEFAULT: z.coerce.number().int().positive().default(300),
  EXERCISE_MEDIA_BASE_URL: z
    .string()
    .url()
    .default("https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/"),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(5),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid environment configuration: ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export const isProduction = () => env().NODE_ENV === "production";
