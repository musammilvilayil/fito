import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { ROLE_LABELS } from "@/shared/permissions";
import { progressEntrySchema } from "@/shared/schemas/workout";
import { hasPermission, inGym, type GymContext } from "../../auth/context";
import { rateLimit } from "../../auth/session";
import { aiGenerations, assistantActions, assistantMessages, assistantThreads } from "../../db/schema";
import type { Tx } from "../../db/tx";
import { env } from "../../env";
import { AppError, conflict, notFound, serviceUnavailable, tooManyRequests } from "../../errors";
import { errorFields, logger } from "../../logger";
import { audit } from "../audit";
import { gymToday } from "../members/service";
import { addProgressEntry } from "../workouts/tracking";
import { assistantCostMicroUsd, assistantModel, type AssistantModel } from "./model";
import { SUGGESTIONS, SYSTEM_PROMPTS } from "./prompts";
import { findTool, personaFor, toolDefinitions, toolsFor, type Persona, type Proposal } from "./tools";

const MAX_STEPS = 6;
const MAX_TOOL_RESULT_CHARS = 16_000;
const REFUSAL_TEXT = "Sorry, I can't help with that one. Try asking about your training, membership or the gym.";
const UNFINISHED_TEXT = "I couldn't finish that. Try asking for one thing at a time.";

export type ActionView = { id: string; type: string; summary: string; status: "pending" | "confirmed" | "cancelled" | "failed"; error?: string };

export type AssistantEvent =
  | { type: "thread"; threadId: string; title: string; notice?: string }
  | { type: "text"; delta: string }
  | { type: "replace"; text: string }
  | { type: "tool"; id: string; name: string; label: string; status: "running" | "done" | "error" }
  | { type: "action"; action: ActionView }
  | { type: "done"; inputTokens: number; outputTokens: number }
  | { type: "error"; code: string; message: string };

type Row = {
  role: "user" | "assistant" | "system";
  kind: "message" | "reply" | "tool_results" | "context";
  content: unknown;
  text: string | null;
  toolNames: string[];
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  costMicroUsd?: number;
};

/* ------------------------------------------------------------ settings */

export function assistantSettings(ctx: GymContext) {
  const a = ctx.gym.settings.assistant;
  return {
    members: a?.members ?? true,
    staff: a?.staff ?? true,
    monthlyMessagesPerUser: a?.monthlyMessagesPerUser ?? env().ASSISTANT_MONTHLY_MESSAGES_DEFAULT,
  };
}

/** Whether this person can use the assistant right now, and why not. */
export function assistantAvailability(ctx: GymContext) {
  const persona = personaFor(ctx);
  const settings = assistantSettings(ctx);
  let reason: string | null = null;
  if (!assistantModel()) {
    reason = hasPermission(ctx, "gym.manage")
      ? "The AI assistant isn't connected yet. Add an Anthropic API key on the server (see Settings → AI)."
      : "The AI assistant isn't switched on for this gym yet.";
  } else if (persona === "member" && !settings.members) {
    reason = "Your gym hasn't turned on the assistant for members.";
  } else if (persona === "staff" && !settings.staff) {
    reason = "The assistant is turned off for staff in Settings → AI.";
  }
  return { available: reason === null, reason, persona, suggestions: SUGGESTIONS[persona] };
}

function configFor(ctx: GymContext, model: AssistantModel) {
  const persona = personaFor(ctx);
  const tools = toolsFor(ctx);
  const definitions = toolDefinitions(tools);
  const system = SYSTEM_PROMPTS[persona];
  const hash = createHash("sha256").update(JSON.stringify({ model: model.model, persona, system, definitions })).digest("hex").slice(0, 32);
  return { persona, tools, definitions, system, hash };
}

/** Facts that change (date, who is asking) go into the conversation, never the system prompt. */
function contextNote(ctx: GymContext, today: string) {
  const weekday = new Date(`${today}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const who = ctx.role === "member" ? "a member" : `staff (${ROLE_LABELS[ctx.role]})`;
  return `Context from FITO (not from the person): today is ${weekday} in the gym's time zone. Gym: ${ctx.gym.name}. You are talking to ${ctx.user.fullName.split(" ")[0]}, ${who}.`;
}

/* ------------------------------------------------------------- threads */

export async function listThreads(tx: Tx, ctx: GymContext) {
  return tx
    .select({ id: assistantThreads.id, title: assistantThreads.title, updatedAt: assistantThreads.updatedAt })
    .from(assistantThreads)
    .where(and(eq(assistantThreads.gymId, ctx.gym.id), eq(assistantThreads.userId, ctx.user.id)))
    .orderBy(desc(assistantThreads.updatedAt))
    .limit(30);
}

async function loadThread(tx: Tx, ctx: GymContext, threadId: string) {
  const [thread] = await tx
    .select()
    .from(assistantThreads)
    .where(and(eq(assistantThreads.id, threadId), eq(assistantThreads.gymId, ctx.gym.id), eq(assistantThreads.userId, ctx.user.id)));
  if (!thread) throw notFound("Conversation not found.");
  return thread;
}

function toActionView(a: typeof assistantActions.$inferSelect): ActionView {
  const error = a.status === "failed" ? ((a.result as { error?: string } | null)?.error ?? "Couldn't save.") : undefined;
  return { id: a.id, type: a.type, summary: a.summary, status: a.status, ...(error ? { error } : {}) };
}

export type ThreadTurn = { role: "user" | "assistant"; text: string; tools: string[]; actions: ActionView[] };

/** The conversation as the person sees it: their messages and the replies, with any proposed changes. */
export async function getThreadView(tx: Tx, ctx: GymContext, threadId: string) {
  const thread = await loadThread(tx, ctx, threadId);
  const rows = await tx.select().from(assistantMessages).where(eq(assistantMessages.threadId, thread.id)).orderBy(asc(assistantMessages.seq));
  const actions = await tx.select().from(assistantActions).where(eq(assistantActions.threadId, thread.id));
  const byId = new Map(actions.map((a) => [a.id, toActionView(a)]));
  const turns: ThreadTurn[] = [];
  let reply: ThreadTurn | null = null;
  for (const r of rows) {
    if (r.kind === "message") {
      turns.push({ role: "user", text: r.text ?? "", tools: [], actions: [] });
      reply = null;
      continue;
    }
    if (r.kind === "context") continue;
    if (!reply) {
      reply = { role: "assistant", text: "", tools: [], actions: [] };
      turns.push(reply);
    }
    if (r.kind === "reply" && r.text) reply.text = reply.text ? `${reply.text}\n\n${r.text}` : r.text;
    reply.tools.push(...r.toolNames);
    if (r.kind === "tool_results") {
      for (const id of actionIdsIn(r.content)) {
        const a = byId.get(id);
        if (a) reply.actions.push(a);
      }
    }
  }
  return { id: thread.id, title: thread.title, turns };
}

function actionIdsIn(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  const ids: string[] = [];
  for (const block of content as { content?: unknown }[]) {
    if (typeof block.content !== "string") continue;
    const m = /"actionId":"([0-9a-f-]{36})"/.exec(block.content);
    if (m) ids.push(m[1]!);
  }
  return ids;
}

export async function deleteThread(tx: Tx, ctx: GymContext, threadId: string) {
  const thread = await loadThread(tx, ctx, threadId);
  await tx.delete(assistantThreads).where(eq(assistantThreads.id, thread.id));
}

/* ---------------------------------------------------------------- turns */

function textOf(content: Anthropic.Beta.BetaContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

async function monthlyMessageCount(tx: Tx, ctx: GymContext) {
  const monthStart = `${gymToday(ctx).slice(0, 8)}01`;
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(assistantMessages)
    .where(
      and(
        eq(assistantMessages.gymId, ctx.gym.id),
        eq(assistantMessages.userId, ctx.user.id),
        eq(assistantMessages.kind, "message"),
        gte(sql`(${assistantMessages.createdAt} at time zone ${ctx.gym.timezone})::date`, sql`${monthStart}::date`),
      ),
    );
  return r?.n ?? 0;
}

/**
 * One assistant turn: appends the person's message, then lets the model call
 * role-allowed tools (up to MAX_STEPS rounds) until it answers. Streams
 * events through `emit`. The transcript is stored append-only, exactly as
 * exchanged with the model; a turn that produced no reply is not stored.
 */
export async function runTurn(
  ctx: GymContext,
  input: { threadId?: string | null; text: string },
  emit: (e: AssistantEvent) => void,
  signal?: AbortSignal,
) {
  const model = assistantModel();
  const availability = assistantAvailability(ctx);
  if (!model || !availability.available) throw serviceUnavailable(availability.reason ?? "The assistant isn't available.");
  await rateLimit(`assistant:${ctx.user.id}`, 20, 600);

  const config = configFor(ctx, model);
  const today = gymToday(ctx);
  const started = Date.now();

  // 1. Thread, history and anything to tell the model about decided actions.
  const prep = await inGym(ctx, async (tx) => {
    const limit = assistantSettings(ctx).monthlyMessagesPerUser;
    if ((await monthlyMessageCount(tx, ctx)) >= limit) {
      throw tooManyRequests(`You've used this month's ${limit} assistant messages. It resets on the 1st.`);
    }
    let notice: string | undefined;
    let thread = input.threadId ? await loadThread(tx, ctx, input.threadId) : null;
    if (thread && thread.configHash !== config.hash) {
      notice = "Started a new chat because the assistant was updated or your access changed.";
      thread = null;
    }
    let created = false;
    if (!thread) {
      const [fresh] = await tx
        .insert(assistantThreads)
        .values({ gymId: ctx.gym.id, userId: ctx.user.id, persona: config.persona, configHash: config.hash, title: input.text.slice(0, 80) })
        .returning();
      thread = fresh!;
      created = true;
    }
    const rows = created
      ? []
      : await tx.select().from(assistantMessages).where(eq(assistantMessages.threadId, thread!.id)).orderBy(asc(assistantMessages.seq));
    const decided = created
      ? []
      : await tx
          .select()
          .from(assistantActions)
          .where(and(eq(assistantActions.threadId, thread!.id), sql`${assistantActions.status} <> 'pending'`, isNull(sql`${assistantActions.result}->>'reported'`)));
    return { thread: thread!, created, notice, history: rows, decided };
  });
  const { thread } = prep;
  emit({ type: "thread", threadId: thread.id, title: thread.title, ...(prep.notice ? { notice: prep.notice } : {}) });

  const history: Anthropic.Beta.BetaMessageParam[] = prep.history.map((r) => ({ role: r.role, content: r.content }) as Anthropic.Beta.BetaMessageParam);
  const lastSeq = prep.history.at(-1)?.seq ?? 0;
  const rows: Row[] = [{ role: "user", kind: "message", content: input.text, text: input.text, toolNames: [] }];
  const notes: string[] = [];
  if (prep.created || thread.contextDate !== today) notes.push(contextNote(ctx, today));
  for (const a of prep.decided) notes.push(`Update: the person ${a.status === "confirmed" ? "confirmed and saved" : a.status === "failed" ? "tried to confirm, but saving failed for" : "cancelled"} "${a.summary}".`);
  // A mid-conversation system message right after the person's message.
  if (notes.length) rows.push({ role: "system", kind: "context", content: notes.join("\n"), text: null, toolNames: [] });

  const toolEvents: { tool: string; ok: boolean }[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let replies = 0;
  let status: "succeeded" | "failed" | "blocked" = "succeeded";
  let lastModel = model.model;
  let failure: AppError | null = null;
  let streamed = false;

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const messages = [...history, ...rows.map((r) => ({ role: r.role, content: r.content }) as Anthropic.Beta.BetaMessageParam)];
      // Text from a later step (after tools ran) starts a new paragraph.
      let firstDelta = true;
      const onText = (delta: string) => {
        emit({ type: "text", delta: firstDelta && streamed ? `\n\n${delta}` : delta });
        firstDelta = false;
        streamed = true;
      };
      const msg = await model.turn({ system: config.system, tools: config.definitions, messages }, onText, signal);
      lastModel = msg.model;
      inputTokens += msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0);
      outputTokens += msg.usage.output_tokens;
      const usage = {
        model: msg.model,
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
        cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
        costMicroUsd: assistantCostMicroUsd(msg.model, msg.usage),
      };
      const toolUses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");

      if (msg.stop_reason === "refusal") {
        status = "blocked";
        rows.push({ role: "assistant", kind: "reply", content: [{ type: "text", text: REFUSAL_TEXT }], text: REFUSAL_TEXT, toolNames: [], ...usage });
        emit({ type: "replace", text: REFUSAL_TEXT });
        replies++;
        break;
      }
      if (msg.stop_reason === "max_tokens" && toolUses.length > 0) {
        // Never run a tool on input that was cut off.
        rows.push({ role: "assistant", kind: "reply", content: [{ type: "text", text: UNFINISHED_TEXT }], text: UNFINISHED_TEXT, toolNames: [], ...usage });
        emit({ type: "replace", text: UNFINISHED_TEXT });
        replies++;
        break;
      }

      rows.push({ role: "assistant", kind: "reply", content: msg.content, text: textOf(msg.content) || null, toolNames: toolUses.map((t) => t.name), ...usage });
      replies++;
      if (msg.stop_reason === "pause_turn") continue;
      if (toolUses.length === 0) break;

      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const use of toolUses) {
        results.push(await runTool(ctx, config.tools, thread.id, use, emit, toolEvents));
      }
      rows.push({ role: "user", kind: "tool_results", content: results, text: null, toolNames: [] });
      if (step === MAX_STEPS - 1) {
        rows.push({ role: "assistant", kind: "reply", content: [{ type: "text", text: UNFINISHED_TEXT }], text: UNFINISHED_TEXT, toolNames: [] });
        emit({ type: "text", delta: `\n\n${UNFINISHED_TEXT}` });
      }
    }
  } catch (err) {
    status = "failed";
    if (signal?.aborted) {
      failure = new AppError(499, "aborted", "Stopped.");
    } else {
      logger.error("assistant turn failed", { gymId: ctx.gym.id, ...errorFields(err) });
      failure = err instanceof AppError ? err : new AppError(502, "ai_error", "The assistant couldn't answer just now. Please try again.");
    }
  }

  // 2. Store the turn, unless the model never replied (then nothing happened).
  await inGym(ctx, async (tx) => {
    if (replies === 0) {
      if (prep.created) await tx.delete(assistantThreads).where(eq(assistantThreads.id, thread.id));
    } else {
      const [locked] = await tx.select({ id: assistantThreads.id }).from(assistantThreads).where(eq(assistantThreads.id, thread.id)).for("update");
      if (!locked) throw notFound("Conversation not found.");
      const [{ maxSeq } = { maxSeq: 0 }] = await tx
        .select({ maxSeq: sql<number>`coalesce(max(${assistantMessages.seq}), 0)::int` })
        .from(assistantMessages)
        .where(eq(assistantMessages.threadId, thread.id));
      if (maxSeq !== lastSeq) throw conflict("This chat changed in another window. Reload it and try again.");
      await tx.insert(assistantMessages).values(
        rows.map((r, i) => ({
          gymId: ctx.gym.id,
          userId: ctx.user.id,
          threadId: thread.id,
          seq: lastSeq + i + 1,
          role: r.role,
          kind: r.kind,
          content: r.content,
          text: r.text,
          toolNames: r.toolNames,
          model: r.model ?? null,
          inputTokens: r.inputTokens ?? 0,
          outputTokens: r.outputTokens ?? 0,
          cacheReadTokens: r.cacheReadTokens ?? 0,
          costMicroUsd: r.costMicroUsd ?? 0,
        })),
      );
      await tx.update(assistantThreads).set({ contextDate: today, updatedAt: new Date() }).where(eq(assistantThreads.id, thread.id));
      for (const a of prep.decided) {
        await tx
          .update(assistantActions)
          .set({ result: sql`coalesce(${assistantActions.result}, '{}'::jsonb) || '{"reported": true}'::jsonb` })
          .where(eq(assistantActions.id, a.id));
      }
      for (const t of toolEvents) await audit(tx, ctx, "assistant.tool", "assistant_thread", thread.id, t);
    }
    // Gym-level usage record (no message content), visible to owners.
    if (model.provider === "anthropic") {
      await tx.insert(aiGenerations).values({
        gymId: ctx.gym.id,
        feature: "assistant",
        memberId: ctx.memberId,
        requestedByStaffId: ctx.staffId,
        provider: model.provider,
        model: lastModel,
        status,
        input: { persona: config.persona, tools: toolEvents.map((t) => t.tool) },
        errorMessage: failure?.message ?? null,
        inputTokens,
        outputTokens,
        costMicroUsd: rows.reduce((s, r) => s + (r.costMicroUsd ?? 0), 0),
        latencyMs: Date.now() - started,
      });
    }
  });

  if (failure) emit({ type: "error", code: failure.code, message: failure.message });
  else emit({ type: "done", inputTokens, outputTokens });
}

async function runTool(
  ctx: GymContext,
  tools: ReturnType<typeof toolsFor>,
  threadId: string,
  use: Anthropic.Beta.BetaToolUseBlock,
  emit: (e: AssistantEvent) => void,
  log: { tool: string; ok: boolean }[],
): Promise<Anthropic.Beta.BetaToolResultBlockParam> {
  const t = findTool(tools, use.name);
  const fail = (message: string): Anthropic.Beta.BetaToolResultBlockParam => {
    log.push({ tool: use.name, ok: false });
    emit({ type: "tool", id: use.id, name: use.name, label: t?.label ?? use.name, status: "error" });
    return { type: "tool_result", tool_use_id: use.id, is_error: true, content: message };
  };
  // Only tools offered to this person can run, whatever the model asks for.
  if (!t) return fail(`Unknown tool: ${use.name}. Use only the tools provided.`);
  const parsed = t.input.safeParse(use.input);
  if (!parsed.success) return fail(`Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);

  emit({ type: "tool", id: use.id, name: t.name, label: t.label, status: "running" });
  try {
    const outcome = await t.run(ctx, parsed.data as never);
    log.push({ tool: t.name, ok: true });
    emit({ type: "tool", id: use.id, name: t.name, label: t.label, status: "done" });
    if ("proposal" in outcome) {
      const action = await createAction(ctx, threadId, outcome.proposal);
      emit({ type: "action", action });
      return {
        type: "tool_result",
        tool_use_id: use.id,
        content: JSON.stringify({ status: "awaiting_confirmation", actionId: action.id, summary: action.summary, note: "Nothing is saved yet. Ask the person to tap Confirm on the card." }),
      };
    }
    const json = JSON.stringify(outcome.data);
    return { type: "tool_result", tool_use_id: use.id, content: json.length > MAX_TOOL_RESULT_CHARS ? `${json.slice(0, MAX_TOOL_RESULT_CHARS)}… (truncated)` : json };
  } catch (err) {
    if (err instanceof AppError) return fail(err.message);
    logger.error("assistant tool failed", { tool: t.name, ...errorFields(err) });
    return fail("That lookup failed. Tell the person you couldn't get this information right now.");
  }
}

async function createAction(ctx: GymContext, threadId: string, p: Proposal): Promise<ActionView> {
  const [a] = await inGym(ctx, (tx) =>
    tx.insert(assistantActions).values({ gymId: ctx.gym.id, userId: ctx.user.id, threadId, type: p.type, payload: p.payload, summary: p.summary }).returning(),
  );
  return toActionView(a!);
}

/* -------------------------------------------------------------- actions */

/**
 * The person confirms or cancels a proposed change. Confirming runs the
 * normal service with their own permissions, exactly as if they had used
 * the form; the model is told the outcome on the next turn.
 */
export async function decideAction(ctx: GymContext, actionId: string, decision: "confirm" | "cancel"): Promise<ActionView> {
  const action = await inGym(ctx, async (tx) => {
    const [a] = await tx
      .select()
      .from(assistantActions)
      .where(and(eq(assistantActions.id, actionId), eq(assistantActions.gymId, ctx.gym.id), eq(assistantActions.userId, ctx.user.id)));
    if (!a) throw notFound("That suggestion no longer exists.");
    if (a.status !== "pending") throw conflict("This was already handled.");
    return a;
  });

  let status: "confirmed" | "cancelled" | "failed" = "cancelled";
  let result: Record<string, unknown> = {};
  if (decision === "confirm") {
    try {
      if (action.type === "progress_entry") {
        const payload = action.payload as Proposal["payload"];
        const entry = await inGym(ctx, (tx) => addProgressEntry(tx, ctx, payload.memberId, progressEntrySchema.parse(payload.entry)));
        result = { entryId: entry.id };
      } else {
        throw new AppError(400, "bad_request", "Unknown action.");
      }
      status = "confirmed";
    } catch (err) {
      status = "failed";
      result = { error: err instanceof AppError ? err.message : "Couldn't save. Please try again from the app." };
      if (!(err instanceof AppError)) logger.error("assistant action failed", errorFields(err));
    }
  }

  const [updated] = await inGym(ctx, async (tx) => {
    await audit(tx, ctx, `assistant.action_${status}`, "assistant_action", action.id, { type: action.type, summary: action.summary });
    return tx
      .update(assistantActions)
      .set({ status, result, decidedAt: new Date() })
      .where(and(eq(assistantActions.id, action.id), eq(assistantActions.status, "pending")))
      .returning();
  });
  if (!updated) throw conflict("This was already handled.");
  return toActionView(updated);
}

/* ---------------------------------------------------------------- usage */

/** Gym-wide AI usage this month (owners): workout drafts and assistant turns. */
export async function assistantUsage(tx: Tx, ctx: GymContext) {
  const monthStart = `${gymToday(ctx).slice(0, 8)}01`;
  const [r] = await tx
    .select({
      turns: sql<number>`count(*)::int`,
      people: sql<number>`count(distinct coalesce(${aiGenerations.memberId}::text, ${aiGenerations.requestedByStaffId}::text))::int`,
      costMicroUsd: sql<number>`coalesce(sum(${aiGenerations.costMicroUsd}), 0)::bigint`,
      failed: sql<number>`count(*) filter (where ${aiGenerations.status} = 'failed')::int`,
    })
    .from(aiGenerations)
    .where(
      and(
        eq(aiGenerations.gymId, ctx.gym.id),
        eq(aiGenerations.feature, "assistant"),
        sql`(${aiGenerations.createdAt} at time zone ${ctx.gym.timezone})::date >= ${monthStart}::date`,
      ),
    );
  return { turns: r?.turns ?? 0, people: r?.people ?? 0, failed: r?.failed ?? 0, costUsd: Number(r?.costMicroUsd ?? 0) / 1_000_000 };
}

export type { Persona };
