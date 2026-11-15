import type Anthropic from "@anthropic-ai/sdk";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inGym, type GymContext } from "@/server/auth/context";
import { AppError } from "@/server/errors";
import { setAssistantModelForTests, type AssistantModel, type AssistantRequest } from "@/server/modules/assistant/model";
import { assistantAvailability, assistantUsage, decideAction, getThreadView, listThreads, runTurn, type AssistantEvent } from "@/server/modules/assistant/service";
import { personaFor, toolsFor } from "@/server/modules/assistant/tools";
import { acceptInvite } from "@/server/modules/auth/service";
import { updateGymSettings } from "@/server/modules/gyms/service";
import { sellMembership } from "@/server/modules/memberships/service";
import { createMember, createMemberInvite } from "@/server/modules/members/service";
import { createPlan } from "@/server/modules/plans/service";
import { inviteStaff } from "@/server/modules/staff/service";
import { aiUsage } from "@/server/modules/workouts/service";
import { listProgress } from "@/server/modules/workouts/tracking";
import { contextFor, meta, newGym, resetDb, uniquePhone } from "../support/db";

type Step = (req: AssistantRequest) => { content: unknown[]; stop?: Anthropic.Beta.BetaStopReason; model?: string };

/** Scripted model: each call takes the next step and records what it was sent. */
class ScriptModel implements AssistantModel {
  readonly provider = "anthropic" as const;
  requests: AssistantRequest[] = [];
  constructor(
    private steps: Step[],
    readonly model = "claude-opus-5-5",
  ) {}
  async turn(req: AssistantRequest, onText: (d: string) => void) {
    this.requests.push(structuredClone(req));
    const step = this.steps.shift();
    if (!step) throw new Error("no scripted step left");
    const { content, stop = "end_turn", model } = step(req);
    for (const b of content as { type: string; text?: string }[]) if (b.type === "text" && b.text) onText(b.text);
    return {
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: model ?? this.model,
      content,
      stop_reason: stop,
      stop_sequence: null,
      usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    } as unknown as Anthropic.Beta.BetaMessage;
  }
}

const text = (t: string): Step => () => ({ content: [{ type: "text", text: t }] });
const callTool = (name: string, input: Record<string, unknown> = {}, id = `toolu_${name}_${Math.random().toString(36).slice(2, 8)}`): Step => () => ({
  content: [
    { type: "thinking", thinking: "", signature: "sig-abc" },
    { type: "tool_use", id, name, input },
  ],
  stop: "tool_use",
});

const memberBase = { email: null, gender: null, dateOfBirth: null, address: null, emergencyContactName: null, emergencyContactPhone: null, notes: null, joinedOn: null, assignedTrainerId: null };

async function setup() {
  const { ctx: owner } = await newGym("Assistant Gym");
  const plan = await inGym(owner, (tx) => createPlan(tx, owner, { name: "Monthly", description: null, durationUnit: "months", durationValue: 1, price: 120000, admissionFee: 0, isActive: true }));
  const add = (fullName: string) => inGym(owner, (tx) => createMember(tx, owner, { ...memberBase, fullName, phone: uniquePhone() }));
  const a = await add("Anjali Menon");
  const b = await add("Biju Kurian");
  await inGym(owner, (tx) =>
    sellMembership(tx, owner, { memberId: a.id, planId: plan.id, startDate: null, chargeAdmission: false, discountType: "amount", discountValue: null, discountNote: null, payNow: true, payment: { amount: 50000, method: "upi", reference: null } } as never),
  );
  const join = async (id: string) => {
    const inv = await inGym(owner, (tx) => createMemberInvite(tx, owner, id));
    const s = await acceptInvite({ token: inv.inviteUrl.split("/").pop()!, password: "member-pass" }, null, meta);
    return contextFor(s.token!);
  };
  return { owner, a, b, memberA: await join(a.id), memberB: await join(b.id) };
}

async function staffCtx(owner: GymContext, role: "trainer" | "receptionist" | "manager") {
  const inv = await inGym(owner, (tx) => inviteStaff(tx, owner, { fullName: `${role} one`, phone: uniquePhone(), email: null, role, specializations: [] }));
  const s = await acceptInvite({ token: inv.inviteUrl.split("/").pop()!, password: "staff-pass-1" }, null, meta);
  return contextFor(s.token!);
}

async function turn(ctx: GymContext, message: string, threadId?: string) {
  const events: AssistantEvent[] = [];
  await runTurn(ctx, { threadId, text: message }, (e) => events.push(e));
  const thread = events.find((e) => e.type === "thread") as Extract<AssistantEvent, { type: "thread" }> | undefined;
  return { events, threadId: thread?.threadId };
}

const err = (e: unknown) => (e instanceof AppError ? e.status : String(e));

describe("AI assistant", () => {
  beforeEach(resetDb);
  afterEach(() => setAssistantModelForTests(undefined));

  it("is unavailable without a provider and respects the gym's on/off settings", async () => {
    const { owner, memberA } = await setup();
    setAssistantModelForTests(null);
    expect(assistantAvailability(owner)).toMatchObject({ available: false, reason: expect.stringContaining("Anthropic API key") });
    expect(assistantAvailability(memberA).reason).toContain("isn't switched on");
    expect(await turn(memberA, "hi").catch(err)).toBe(503);

    setAssistantModelForTests(new ScriptModel([]));
    expect(assistantAvailability(memberA).available).toBe(true);
    await inGym(owner, (tx) =>
      updateGymSettings(tx, owner, { expiringSoonDays: 7, sessionMinutes: 90, openingHours: null, availableEquipment: [], assistant: { members: false, staff: true, monthlyMessagesPerUser: 300 } } as never),
    );
    const reloaded = { ...memberA, gym: { ...memberA.gym, settings: { ...memberA.gym.settings, assistant: { members: false, staff: true, monthlyMessagesPerUser: 300 } } } };
    expect(assistantAvailability(reloaded).available).toBe(false);
  });

  it("offers each role only the tools its permissions allow", async () => {
    const { owner, memberA } = await setup();
    const names = (ctx: GymContext) => toolsFor(ctx).map((t) => t.name);
    expect(personaFor(memberA)).toBe("member");
    expect(names(memberA)).toEqual(
      expect.arrayContaining(["get_my_membership", "get_my_workout_plan", "get_my_progress", "get_gym_info", "search_exercises", "propose_progress_entry"]),
    );
    expect(names(memberA)).not.toEqual(expect.arrayContaining(["get_revenue"]));
    expect(names(memberA).some((n) => ["get_revenue", "list_pending_payments", "find_members", "get_today_overview"].includes(n))).toBe(false);

    expect(names(owner)).toEqual(expect.arrayContaining(["get_today_overview", "get_revenue", "list_pending_payments", "list_expiring_memberships", "list_inactive_members", "list_pending_approvals", "get_trainers", "find_members"]));
    expect(names(owner)).not.toContain("get_my_membership");

    const trainer = await staffCtx(owner, "trainer");
    expect(names(trainer)).not.toContain("get_revenue");
    expect(names(trainer)).not.toContain("list_pending_payments");
    expect(names(trainer)).toContain("list_pending_approvals");

    const desk = await staffCtx(owner, "receptionist");
    expect(names(desk)).toContain("get_today_overview");
    expect(names(desk)).not.toContain("list_pending_approvals");
  });

  it("runs a tool loop, streams, and stores the conversation append-only", async () => {
    const { memberA } = await setup();
    const model = new ScriptModel([callTool("get_my_membership"), text("Your Monthly plan is active and ₹700 is due."), text("Glad to help!")]);
    setAssistantModelForTests(model);

    const first = await turn(memberA, "When does my membership end?");
    const kinds = first.events.map((e) => e.type);
    expect(kinds[0]).toBe("thread");
    expect(kinds).toContain("tool");
    expect(kinds.at(-1)).toBe("done");
    // The tool result reached the model with the member's own data.
    const toolResult = JSON.stringify(model.requests[1]!.messages.at(-1));
    expect(toolResult).toContain("₹700");
    expect(toolResult).toContain("Monthly");
    // First turn: the person's message, then a context system message.
    const firstReq = model.requests[0]!;
    expect(firstReq.messages.map((m) => m.role)).toEqual(["user", "system"]);
    expect(String(firstReq.messages[1]!.content)).toContain("Assistant Gym");
    expect(firstReq.system).not.toContain("Assistant Gym"); // volatile facts stay out of the system prompt

    // Second turn replays the stored transcript exactly (including thinking blocks), then appends.
    await turn(memberA, "Thanks", first.threadId);
    const replay = model.requests[2]!.messages;
    expect(replay.slice(0, 5)).toEqual([...model.requests[1]!.messages, { role: "assistant", content: [{ type: "text", text: "Your Monthly plan is active and ₹700 is due." }] }]);
    expect(JSON.stringify(replay)).toContain("sig-abc");
    expect(replay.at(-1)).toEqual({ role: "user", content: "Thanks" }); // same day: no new context message
    expect(model.requests[2]!.system).toBe(firstReq.system);
    expect(model.requests[2]!.tools).toEqual(firstReq.tools);

    const view = await inGym(memberA, (tx) => getThreadView(tx, memberA, first.threadId!));
    expect(view.turns.map((t) => [t.role, t.text])).toEqual([
      ["user", "When does my membership end?"],
      ["assistant", "Your Monthly plan is active and ₹700 is due."],
      ["user", "Thanks"],
      ["assistant", "Glad to help!"],
    ]);
    expect(view.turns[1]!.tools).toEqual(["get_my_membership"]);
  });

  it("refuses tools outside the person's role and rejects invalid input", async () => {
    const { memberA } = await setup();
    const model = new ScriptModel([callTool("get_revenue", { period: "today" }), callTool("get_my_attendance", { bogus: true }), callTool("propose_progress_entry", { weightKg: 9000 }), text("ok")]);
    setAssistantModelForTests(model);
    await turn(memberA, "Show me the gym's revenue");
    const results = model.requests.slice(1).map((r) => r.messages.at(-1)!.content as { is_error?: boolean; content: string }[]);
    expect(results[0]![0]).toMatchObject({ is_error: true, content: expect.stringContaining("Unknown tool") });
    // Unknown keys are stripped by the schema; the call itself is fine.
    expect(results[1]![0]!.is_error).toBeUndefined();
    expect(results[2]![0]).toMatchObject({ is_error: true, content: expect.stringContaining("Invalid input") });
  });

  it("only saves a proposed change after the person confirms it", async () => {
    const { memberA, memberB, a } = await setup();
    const model = new ScriptModel([callTool("propose_progress_entry", { weightKg: 72.5, waistCm: 84 }), text("Tap Confirm to save it."), text("Saved!")]);
    setAssistantModelForTests(model);
    const first = await turn(memberA, "Log my weight 72.5 kg and waist 84");
    const actionEvent = first.events.find((e) => e.type === "action") as Extract<AssistantEvent, { type: "action" }>;
    expect(actionEvent.action).toMatchObject({ status: "pending", summary: expect.stringContaining("weight 72.5 kg") });
    expect(await inGym(memberA, (tx) => listProgress(tx, memberA, a.id))).toHaveLength(0);

    // Someone else can't confirm it.
    expect(await decideAction(memberB, actionEvent.action.id, "confirm").catch(err)).toBe(404);

    const done = await decideAction(memberA, actionEvent.action.id, "confirm");
    expect(done.status).toBe("confirmed");
    const saved = await inGym(memberA, (tx) => listProgress(tx, memberA, a.id));
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ weightKg: 72.5, measurements: { waistCm: 84 } });
    expect(await decideAction(memberA, actionEvent.action.id, "cancel").catch(err)).toBe(409);

    // The model hears the outcome on the next turn, once.
    await turn(memberA, "Did it save?", first.threadId);
    const note = model.requests[2]!.messages.at(-1)!;
    expect(note.role).toBe("system");
    expect(String(note.content)).toContain("confirmed and saved");
    const view = await inGym(memberA, (tx) => getThreadView(tx, memberA, first.threadId!));
    expect(view.turns[1]!.actions[0]).toMatchObject({ status: "confirmed" });
  });

  it("keeps conversations private to the person, even from the gym owner", async () => {
    const { owner, memberA } = await setup();
    setAssistantModelForTests(new ScriptModel([text("Hello Anjali")]));
    const { threadId } = await turn(memberA, "Hello");
    expect(await inGym(owner, (tx) => getThreadView(tx, owner, threadId!)).catch(err)).toBe(404);
    expect(await inGym(owner, (tx) => listThreads(tx, owner))).toHaveLength(0);
    // Even a raw query as the app role can't see another user's rows.
    const visible = await inGym(owner, (tx) => tx.execute(sqlCount));
    expect(visible.rows[0]).toMatchObject({ n: 0 });
    // The owner sees usage, not content.
    const usage = await inGym(owner, (tx) => assistantUsage(tx, owner));
    expect(usage.turns).toBe(1);
    expect((await inGym(owner, (tx) => aiUsage(tx, owner))).calls).toBe(0); // workout-draft quota untouched
  });

  it("handles refusals, failures and a changed setup safely", async () => {
    const { memberA } = await setup();
    // Refusal: a clean reply is stored instead of partial output.
    setAssistantModelForTests(new ScriptModel([() => ({ content: [{ type: "text", text: "partial" }], stop: "refusal" })]));
    const refused = await turn(memberA, "something odd");
    expect(refused.events).toContainEqual(expect.objectContaining({ type: "replace" }));
    const view = await inGym(memberA, (tx) => getThreadView(tx, memberA, refused.threadId!));
    expect(view.turns[1]!.text).toContain("can't help with that");

    // Provider failure before any reply: nothing is stored, the new thread is removed.
    setAssistantModelForTests(new ScriptModel([]));
    const failed = await turn(memberA, "hello?");
    expect(failed.events.at(-1)).toMatchObject({ type: "error", code: "ai_error" });
    expect((await inGym(memberA, (tx) => listThreads(tx, memberA))).map((t) => t.id)).toEqual([refused.threadId]);

    // A different model (or tool set) can't replay the old transcript: start a new thread.
    setAssistantModelForTests(new ScriptModel([text("new model here")], "claude-sonnet-5-5"));
    const switched = await turn(memberA, "still there?", refused.threadId);
    expect(switched.events[0]).toMatchObject({ type: "thread", notice: expect.stringContaining("new chat") });
    expect(switched.threadId).not.toBe(refused.threadId);
  });

  it("enforces the monthly message limit per person", async () => {
    const { memberA } = await setup();
    const limited = { ...memberA, gym: { ...memberA.gym, settings: { ...memberA.gym.settings, assistant: { members: true, staff: true, monthlyMessagesPerUser: 1 } } } };
    setAssistantModelForTests(new ScriptModel([text("one"), text("two")]));
    await turn(limited, "first");
    expect(await turn(limited, "second").catch(err)).toBe(429);
  });
});

const sqlCount = sql`select count(*)::int as n from assistant_messages`;
