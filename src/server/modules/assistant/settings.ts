import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import type { aiSettingsSchema } from "@/shared/schemas/assistant";
import { requirePermission, type GymContext } from "../../auth/context";
import { rateLimit } from "../../auth/session";
import { gyms, type GymSettings } from "../../db/schema";
import type { Tx } from "../../db/tx";
import { env } from "../../env";
import { audit } from "../audit";
import { getGymProfile } from "../gyms/service";
import { aiMonthlyLimit, aiUsage } from "../workouts/service";
import { assistantModel } from "./model";
import { assistantSettings, assistantUsage } from "./service";
import { eq } from "drizzle-orm";

/** Settings → AI: connection status (never the key), usage this month and the gym's limits. */
export async function getAiSettings(tx: Tx, ctx: GymContext) {
  requirePermission(ctx, "gym.manage");
  const e = env();
  const model = assistantModel();
  return {
    connected: model !== null,
    provider: model?.provider ?? null,
    model: model?.model ?? e.ASSISTANT_MODEL ?? e.AI_MODEL,
    workoutModel: e.AI_MODEL,
    settings: { aiMonthlyLimit: aiMonthlyLimit(ctx), ...assistantSettingsFlat(ctx) },
    usage: { workouts: await aiUsage(tx, ctx), assistant: await assistantUsage(tx, ctx) },
  };
}

function assistantSettingsFlat(ctx: GymContext) {
  const a = assistantSettings(ctx);
  return { assistantMembers: a.members, assistantStaff: a.staff, assistantMonthlyMessagesPerUser: a.monthlyMessagesPerUser };
}

export async function updateAiSettings(tx: Tx, ctx: GymContext, input: z.output<typeof aiSettingsSchema>) {
  requirePermission(ctx, "gym.manage");
  const current = await getGymProfile(tx, ctx);
  const settings: GymSettings = {
    ...current.settings,
    aiMonthlyLimit: input.aiMonthlyLimit,
    assistant: { members: input.assistantMembers, staff: input.assistantStaff, monthlyMessagesPerUser: input.assistantMonthlyMessagesPerUser },
  };
  await tx.update(gyms).set({ settings, updatedAt: new Date() }).where(eq(gyms.id, ctx.gym.id));
  await audit(tx, ctx, "gym.ai_settings", "gym", ctx.gym.id, input);
  return settings;
}

/** Sends one tiny request to check the server's API key works. */
export async function testAiConnection(ctx: GymContext) {
  requirePermission(ctx, "gym.manage");
  await rateLimit(`ai-test:${ctx.gym.id}`, 5, 3600);
  const model = assistantModel();
  if (!model) return { ok: false as const, message: "No API key is set on the server." };
  const started = Date.now();
  try {
    const msg = await model.turn(
      { system: "You are a connection check. Reply with the single word OK.", tools: [], messages: [{ role: "user", content: "Connection check" }] },
      () => undefined,
    );
    return { ok: true as const, model: msg.model, latencyMs: Date.now() - started };
  } catch (err) {
    let message = "The request failed. Check the server logs.";
    if (err instanceof Anthropic.AuthenticationError) message = "Anthropic rejected the API key. Check ANTHROPIC_API_KEY on the server.";
    else if (err instanceof Anthropic.PermissionDeniedError) message = "The API key doesn't have access to this model.";
    else if (err instanceof Anthropic.RateLimitError) message = "Anthropic is rate-limiting this key right now. Try again in a minute.";
    else if (err instanceof Anthropic.APIConnectionError) message = "The server couldn't reach Anthropic. Check its outbound network access.";
    else if (err instanceof Anthropic.APIError) message = `Anthropic returned an error (${err.status}).`;
    return { ok: false as const, message };
  }
}
