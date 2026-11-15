import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PlanContent } from "@/shared/schemas/workout";
import { checkPlan } from "@/shared/workout-rules";
import { inGym, type GymContext } from "@/server/auth/context";
import { AppError } from "@/server/errors";
import { setWorkoutAIForTests, type AiPlan, type WorkoutAI, type WorkoutAIInput } from "@/server/modules/ai/workout-ai";
import { acceptInvite } from "@/server/modules/auth/service";
import { candidatesFor, exerciseMap } from "@/server/modules/exercises/service";
import { assignTrainer, createMember } from "@/server/modules/members/service";
import { inviteStaff } from "@/server/modules/staff/service";
import { updateGymSettings } from "@/server/modules/gyms/service";
import {
  aiUsage,
  approvePlan,
  generatePlan,
  getPlanDetail,
  listPlans,
  recordClearance,
  revisePlan,
  saveHealthScreening,
  updateFitnessProfile,
  updatePlan,
} from "@/server/modules/workouts/service";
import { adminPool, contextFor, meta, newGym, resetDb, uniquePhone } from "../support/db";

const memberBase = { email: null, gender: null, dateOfBirth: null, address: null, emergencyContactName: null, emergencyContactPhone: null, notes: null, joinedOn: null, assignedTrainerId: null };

async function setup(limitationTags: string[] = []) {
  const { ctx } = await newGym("Workout Gym");
  await inGym(ctx, (tx) =>
    updateGymSettings(tx, ctx, { expiringSoonDays: 7, sessionMinutes: 90, openingHours: null, availableEquipment: ["dumbbell", "barbell", "machine", "cable", "body only"] } as never),
  );
  const m = await inGym(ctx, (tx) => createMember(tx, ctx, { ...memberBase, fullName: "Gokul Das", phone: uniquePhone() }));
  // Refresh context so gym settings (equipment) are current.
  const fresh = { ...ctx, gym: { ...ctx.gym, settings: { ...ctx.gym.settings, availableEquipment: ["dumbbell", "barbell", "machine", "cable", "body only"] } } } as GymContext;
  await inGym(fresh, (tx) =>
    updateFitnessProfile(tx, fresh, m.id, {
      fitnessGoal: "muscle_gain",
      experienceLevel: "beginner",
      trainingDaysPerWeek: 3,
      sessionMinutes: 60,
      exercisePreferences: null,
      limitations: limitationTags.length ? "Old injury" : null,
      limitationTags: limitationTags as never,
    }),
  );
  return { ctx: fresh, memberId: m.id };
}

/** Fake provider: drafts from the candidate list, optionally misbehaving. */
class FakeAI implements WorkoutAI {
  readonly provider = "anthropic";
  readonly model = "claude-opus-5-5";
  calls: WorkoutAIInput[] = [];
  constructor(private behaviour: ("valid" | "unknown_id" | "throw")[]) {}
  async draftPlan(input: WorkoutAIInput) {
    this.calls.push(input);
    const mode = this.behaviour[Math.min(this.calls.length - 1, this.behaviour.length - 1)];
    if (mode === "throw") throw new Error("network down");
    const strength = input.candidates.filter((c) => c.category === "strength");
    const day = (i: number) => ({
      title: `Day ${i + 1}`,
      focus: "Full body",
      weekday: i * 2,
      exercises: strength.slice(i * 4, i * 4 + 4).map((c) => ({ exerciseId: c.id, sets: 3, reps: "8-12", restSeconds: 60, notes: "Control the lowering" })),
    });
    const draft: AiPlan = { name: "Beginner hypertrophy", rationale: "Three full-body days.", warmup: "Walk 5 min", cooldown: "Stretch", notes: "", days: [day(0), day(1), day(2)] };
    if (mode === "unknown_id") draft.days[0]!.exercises[0]!.exerciseId = "Made_Up_Exercise";
    return { draft, model: this.model, inputTokens: 5000, outputTokens: 1500 };
  }
}

const generate = (ctx: GymContext, memberId: string, mode: "ai" | "template" | "blank" = "ai") => generatePlan(ctx, { memberId, mode, instructions: null });

async function staff(owner: GymContext, role: "trainer" | "receptionist") {
  const inv = await inGym(owner, (tx) => inviteStaff(tx, owner, { fullName: `${role} person`, phone: uniquePhone(), email: null, role, specializations: [] }));
  const s = await acceptInvite({ token: inv.inviteUrl.split("/").pop()!, password: "staff-pass-1" }, null, meta);
  const c = await contextFor(s.token!);
  return { ...c, gym: { ...c.gym, settings: owner.gym.settings } } as GymContext;
}

describe("workout generation", () => {
  beforeEach(resetDb);
  afterEach(() => setWorkoutAIForTests(undefined));

  it("builds a safe template plan that respects limitations", async () => {
    const { ctx, memberId } = await setup(["knee", "lower_back"]);
    const out = await generate(ctx, memberId, "template");
    expect(out.source).toBe("template");
    const detail = await inGym(ctx, (tx) => getPlanDetail(tx, ctx, out.planId));
    expect(detail.plan.status).toBe("pending_review");
    expect(detail.content.days).toHaveLength(3);
    const ids = detail.content.days.flatMap((d) => d.exercises.map((e) => e.exerciseId));
    const map = await inGym(ctx, (tx) => exerciseMap(tx, ctx, ids));
    for (const id of ids) {
      expect(map.get(id)!.riskTags).not.toContain("deep_knee");
      expect(map.get(id)!.riskTags).not.toContain("spinal_load");
      expect(map.get(id)!.level).toBe("beginner");
    }
    expect(detail.issues.filter((i) => i.level === "error")).toEqual([]);
  });

  it("uses a valid AI draft and records tokens and cost", async () => {
    const { ctx, memberId } = await setup();
    const ai = new FakeAI(["valid"]);
    setWorkoutAIForTests(ai);
    const out = await generate(ctx, memberId);
    expect(out).toMatchObject({ source: "ai", notice: null });
    const detail = await inGym(ctx, (tx) => getPlanDetail(tx, ctx, out.planId));
    expect(detail.plan).toMatchObject({ name: "Beginner hypertrophy", status: "pending_review", source: "ai" });
    expect(detail.ai).toMatchObject({ status: "succeeded", inputTokens: 5000, outputTokens: 1500 });
    // The prompt carries no name or phone, only the anonymised profile.
    expect(JSON.stringify(ai.calls[0])).not.toContain("Gokul");
    const usage = await inGym(ctx, (tx) => aiUsage(tx, ctx));
    expect(usage).toMatchObject({ calls: 1, inputTokens: 5000, outputTokens: 1500 });
    expect(usage.costUsd).toBeCloseTo(0.05); // 5000*$4/M + 1500*$20/M
  });

  it("retries once with the problems, then falls back to a template", async () => {
    const { ctx, memberId } = await setup();
    const fixed = new FakeAI(["unknown_id", "valid"]);
    setWorkoutAIForTests(fixed);
    expect((await generate(ctx, memberId)).source).toBe("ai");
    expect(fixed.calls[1]!.previousErrors?.[0]).toMatch(/Unknown exercise "Made_Up_Exercise"/);

    const broken = new FakeAI(["unknown_id", "unknown_id"]);
    setWorkoutAIForTests(broken);
    const out = await generate(ctx, memberId);
    expect(out.source).toBe("template");
    expect(out.notice).toMatch(/didn't pass FITO's safety and library checks/);
    const rows = await adminPool().query("select status, validation_errors from ai_generations where gym_id = $1 order by created_at", [ctx.gym.id]);
    expect(rows.rows.map((r) => r.status)).toEqual(["succeeded", "invalid_output"]);
  });

  it("falls back to templates when AI fails, is not configured, or is over quota", async () => {
    const { ctx, memberId } = await setup();
    setWorkoutAIForTests(new FakeAI(["throw"]));
    expect((await generate(ctx, memberId)).notice).toMatch(/couldn't be reached/);
    setWorkoutAIForTests(null);
    expect((await generate(ctx, memberId)).notice).toMatch(/isn't configured/);
    const limited = { ...ctx, gym: { ...ctx.gym, settings: { ...ctx.gym.settings, aiMonthlyLimit: 1 } } } as GymContext;
    setWorkoutAIForTests(new FakeAI(["valid"]));
    expect((await generate(limited, memberId)).notice).toMatch(/used this month's 1 AI generations/);
  });

  it("blocks generation until a trainer records medical clearance", async () => {
    const { ctx, memberId } = await setup();
    await inGym(ctx, (tx) =>
      saveHealthScreening(tx, ctx, memberId, { heartCondition: false, chestPain: true, dizziness: false, boneOrJointProblem: false, bloodPressureMedication: false, pregnant: false, otherReason: false }),
    );
    const blocked = await generate(ctx, memberId, "template").catch((e) => e);
    expect((blocked as AppError).status).toBe(409);
    await inGym(ctx, (tx) => recordClearance(tx, ctx, memberId, "Doctor's note seen 15 Nov"));
    expect((await generate(ctx, memberId, "template")).source).toBe("template");
  });

  it("requires a complete fitness profile", async () => {
    const { ctx } = await newGym();
    const m = await inGym(ctx, (tx) => createMember(tx, ctx, { ...memberBase, fullName: "No Profile", phone: uniquePhone() }));
    const err = await generate(ctx, m.id, "template").catch((e) => e);
    expect((err as AppError).message).toMatch(/Complete the member's fitness profile/);
  });
});

describe("trainer approval and versions", () => {
  beforeEach(resetDb);
  afterEach(() => setWorkoutAIForTests(undefined));

  it("only an approval makes a plan active; warnings need acknowledgement; edits create versions", async () => {
    const { ctx, memberId } = await setup(["knee"]);
    const trainer = await staff(ctx, "trainer");
    await inGym(ctx, (tx) => assignTrainer(tx, ctx, memberId, trainer.staffId!));
    const { planId } = await generate(trainer, memberId, "template");

    // The database itself refuses an "active" plan without an approver.
    const direct = await adminPool().query("update workout_plans set status = 'active' where id = $1", [planId]).catch((e) => e);
    expect(String(direct)).toMatch(/workout_plans_active_requires_approval/);

    // Trainer adds a deep-knee exercise for a member with knee problems → warning.
    const detail = await inGym(trainer, (tx) => getPlanDetail(tx, trainer, planId));
    const content: PlanContent = structuredClone(detail.content);
    content.days[0]!.exercises.push({ exerciseId: "Barbell_Squat", sets: 3, reps: "5", restSeconds: 120, notes: "" });
    await inGym(trainer, (tx) => updatePlan(tx, trainer, planId, { name: "Custom plan", goal: "strength", content, changeSummary: "Added squats" }));
    const after = await inGym(trainer, (tx) => getPlanDetail(tx, trainer, planId));
    expect(after.plan.currentVersion).toBe(2);
    expect(after.versions.map((v) => v.version)).toEqual([2, 1]);
    expect(after.issues.some((i) => /Barbell Squat/.test(i.message) && /limitations/.test(i.message))).toBe(true);

    const unacknowledged = await inGym(trainer, (tx) => approvePlan(tx, trainer, planId, { acknowledgeWarnings: false })).catch((e) => e);
    expect((unacknowledged as AppError).status).toBe(409);
    await inGym(trainer, (tx) => approvePlan(tx, trainer, planId, { acknowledgeWarnings: true }));
    const active = await inGym(trainer, (tx) => getPlanDetail(tx, trainer, planId));
    expect(active.plan.status).toBe("active");
    expect(active.approvedBy).toBe("trainer person");

    // Active plans are frozen; revise makes a new draft and approving it archives the old one.
    const edit = await inGym(trainer, (tx) => updatePlan(tx, trainer, planId, { name: "x", goal: null, content, changeSummary: null })).catch((e) => e);
    expect((edit as AppError).status).toBe(409);
    const { planId: draftId } = await inGym(trainer, (tx) => revisePlan(tx, trainer, planId));
    await inGym(trainer, (tx) => approvePlan(tx, trainer, draftId, { acknowledgeWarnings: true }));
    const plans = await inGym(trainer, (tx) => listPlans(tx, trainer, { memberId }));
    expect(plans.find((p) => p.id === planId)?.status).toBe("archived");
    expect(plans.find((p) => p.id === draftId)?.status).toBe("active");
  });

  it("keeps trainers to their own members and front desk out of workouts", async () => {
    const { ctx, memberId } = await setup();
    const trainer = await staff(ctx, "trainer");
    const desk = await staff(ctx, "receptionist");
    // Unassigned members are invisible to the trainer (404, not 403: nothing is revealed).
    const notAssigned = await generate(trainer, memberId, "template").catch((e) => e);
    expect((notAssigned as AppError).status).toBe(404);
    const deskErr = await generate(desk, memberId, "template").catch((e) => e);
    expect((deskErr as AppError).status).toBe(403);
    const { planId } = await generate(ctx, memberId, "template");
    const peek = await inGym(trainer, (tx) => getPlanDetail(tx, trainer, planId)).catch((e) => e);
    expect((peek as AppError).status).toBe(404);
  });
});

describe("plan checks", () => {
  beforeEach(resetDb);

  it("flags unknown exercises, level mismatches and over-long sessions", async () => {
    const { ctx } = await setup();
    const candidates = await inGym(ctx, (tx) => candidatesFor(tx, ctx, { experienceLevel: "advanced", limitationTags: [] }));
    const expert = candidates.find((c) => c.level === "expert")!;
    const map = new Map(candidates.map((c) => [c.id, c]));
    const content: PlanContent = {
      warmup: "",
      cooldown: "",
      notes: "",
      days: [{ key: "day1", title: "Day 1", focus: "", weekday: 0, exercises: [{ exerciseId: expert.id, sets: 10, reps: "10", restSeconds: 300, notes: "" }, { exerciseId: "nope", sets: 3, reps: "10", restSeconds: 60, notes: "" }] }],
    };
    const issues = checkPlan(content, { exercises: map, experienceLevel: "beginner", sessionMinutes: 30, trainingDaysPerWeek: 3 });
    const text = issues.map((i) => `${i.level}:${i.message}`).join("\n");
    expect(text).toMatch(/error:Unknown exercise "nope"/);
    expect(text).toMatch(/warning:.*expert-level; member is beginner/);
    expect(text).toMatch(/warning:Day 1 takes about \d+ min/);
    expect(text).toMatch(/warning:Plan has 1 training days; member wants 3/);
  });
});
