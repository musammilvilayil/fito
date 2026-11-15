import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../env";
import { costMicroUsd } from "../ai/workout-ai";

/**
 * Provider boundary for the in-app assistant. The service builds the
 * request (system prompt, role-filtered tools, the stored transcript) and
 * runs the tools; a provider only turns one request into one model message,
 * streaming text as it arrives.
 */
export type AssistantRequest = {
  system: string;
  tools: Anthropic.Beta.BetaTool[];
  messages: Anthropic.Beta.BetaMessageParam[];
};

export interface AssistantModel {
  readonly provider: "anthropic" | "fake";
  readonly model: string;
  turn(req: AssistantRequest, onText: (delta: string) => void, signal?: AbortSignal): Promise<Anthropic.Beta.BetaMessage>;
}

class ClaudeAssistant implements AssistantModel {
  readonly provider = "anthropic" as const;
  private client: Anthropic;
  constructor(
    apiKey: string,
    readonly model: string,
    private effort: "low" | "medium" | "high",
  ) {
    this.client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });
  }

  async turn(req: AssistantRequest, onText: (delta: string) => void, signal?: AbortSignal) {
    const stream = this.client.beta.messages.stream(
      {
        model: this.model,
        max_tokens: 16000,
        // Stable prefix (tools + system) first; the transcript is append-only,
        // so automatic caching reuses earlier turns.
        cache_control: { type: "ephemeral" },
        system: req.system,
        ...(req.tools.length ? { tools: req.tools } : {}),
        messages: req.messages,
        output_config: { effort: this.effort },
        // If the model declines, the API retries on a fallback model in the same call.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      },
      { signal },
    );
    stream.on("text", onText);
    return stream.finalMessage();
  }
}

let override: AssistantModel | null | undefined;

/** Tests swap in a scripted model. */
export function setAssistantModelForTests(model: AssistantModel | null | undefined) {
  override = model;
}

/** The configured assistant model, or null when no provider is set up. */
export function assistantModel(): AssistantModel | null {
  if (override !== undefined) return override;
  const e = env();
  if (e.ASSISTANT_PROVIDER === "fake") return new ScriptedAssistant();
  if (!e.ANTHROPIC_API_KEY) return null;
  return new ClaudeAssistant(e.ANTHROPIC_API_KEY, e.ASSISTANT_MODEL ?? e.AI_MODEL, e.ASSISTANT_EFFORT);
}

/** Cost of one model call, including cache writes (1.25x input) and reads (0.05x input). */
export function assistantCostMicroUsd(model: string, usage: Anthropic.Beta.BetaUsage): number {
  const base = costMicroUsd(model, usage.input_tokens, usage.output_tokens);
  const perInput = costMicroUsd(model, 1_000_000, 0) / 1_000_000;
  return Math.round(base + (usage.cache_creation_input_tokens ?? 0) * perInput * 1.25 + (usage.cache_read_input_tokens ?? 0) * perInput * 0.05);
}

/* ------------------------------------------------------------- test stand-in */

const SCRIPT: { match: RegExp; tool: string; input: (text: string) => Record<string, unknown> }[] = [
  { match: /membership|expire|renew|due/i, tool: "get_my_membership", input: () => ({}) },
  { match: /weigh|weight is|i am \d+ ?kg|log .*kg/i, tool: "propose_progress_entry", input: (t) => ({ weightKg: Number(/(\d+(?:\.\d+)?)\s?kg/i.exec(t)?.[1] ?? 70) }) },
  { match: /today|attendance|inside|occupancy/i, tool: "get_today_overview", input: () => ({}) },
  { match: /approv/i, tool: "list_pending_approvals", input: () => ({}) },
  { match: /hours|open/i, tool: "get_gym_info", input: () => ({}) },
];

/**
 * Deterministic stand-in used by automated tests (ASSISTANT_PROVIDER=fake).
 * It calls one matching tool, then summarises the tool result. Never use it
 * in production: it does not understand anything.
 */
class ScriptedAssistant implements AssistantModel {
  readonly provider = "fake" as const;
  readonly model = "fito-scripted-test-model";

  async turn(req: AssistantRequest, onText: (delta: string) => void): Promise<Anthropic.Beta.BetaMessage> {
    const last = req.messages.at(-1);
    const lastUser = [...req.messages].reverse().find((m) => m.role === "user" && typeof m.content === "string");
    const userText = typeof lastUser?.content === "string" ? lastUser.content : "";
    const toolNames = new Set(req.tools.map((t) => t.name));
    let content: Anthropic.Beta.BetaContentBlock[];
    let stop: Anthropic.Beta.BetaStopReason = "end_turn";

    const lastContent = last?.content;
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = Array.isArray(lastContent)
      ? (lastContent.filter((b) => b.type === "tool_result") as Anthropic.Beta.BetaToolResultBlockParam[])
      : [];
    if (results.length > 0) {
      const raw = results.map((r) => (typeof r.content === "string" ? r.content : JSON.stringify(r.content))).join("\n");
      const text = `Here is what I found: ${raw.slice(0, 600)}`;
      content = [{ type: "text", text, citations: null }];
    } else {
      const step = SCRIPT.find((s) => s.match.test(userText) && toolNames.has(s.tool));
      if (step) {
        content = [
          { type: "text", text: "Let me check.", citations: null },
          { type: "tool_use", id: `toolu_fake_${Date.now()}`, name: step.tool, input: step.input(userText), caller: { type: "direct" } },
        ] as Anthropic.Beta.BetaContentBlock[];
        stop = "tool_use";
      } else {
        content = [{ type: "text", text: `You said: ${userText.slice(0, 200)}`, citations: null }];
      }
    }
    for (const b of content) if (b.type === "text") onText(b.text);
    return {
      id: `msg_fake_${Date.now()}`,
      type: "message",
      role: "assistant",
      model: this.model,
      content,
      stop_reason: stop,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    } as unknown as Anthropic.Beta.BetaMessage;
  }
}
