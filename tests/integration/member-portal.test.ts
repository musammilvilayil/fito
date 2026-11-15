import { beforeEach, describe, expect, it } from "vitest";
import { addDays, todayIn } from "@/shared/dates";
import { progressEntrySchema, workoutLogSchema } from "@/shared/schemas/workout";
import { inGym, type GymContext } from "@/server/auth/context";
import { AppError } from "@/server/errors";
import { acceptInvite } from "@/server/modules/auth/service";
import { sellMembership } from "@/server/modules/memberships/service";
import { assignTrainer, createMember, createMemberInvite, getMember } from "@/server/modules/members/service";
import { createPlan } from "@/server/modules/plans/service";
import { memberBilling, memberHome, selfView } from "@/server/modules/portal/service";
import { inviteStaff } from "@/server/modules/staff/service";
import {
  approvePlan,
  generatePlan,
  getPlanDetail,
  recordClearance,
  saveHealthScreening,
  updateFitnessProfile,
} from "@/server/modules/workouts/service";
import { addProgressEntry, deleteProgressEntry, listProgress, listWorkoutLogs, logWorkout } from "@/server/modules/workouts/tracking";
import { contextFor, meta, newGym, resetDb, uniquePhone } from "../support/db";

const memberBase = { email: null, gender: null, dateOfBirth: null, address: null, emergencyContactName: null, emergencyContactPhone: null, joinedOn: null, assignedTrainerId: null };
const NO = { heartCondition: false, chestPain: false, dizziness: false, boneOrJointProblem: false, bloodPressureMedication: false, pregnant: false, otherReason: false };

async function joinAsMember(owner: GymContext, memberId: string) {
  const inv = await inGym(owner, (tx) => createMemberInvite(tx, owner, memberId));
  const s = await acceptInvite({ token: inv.inviteUrl.split("/").pop()!, password: "member-pass" }, null, meta);
  return contextFor(s.token!);
}

async function setup() {
  const { ctx: owner } = await newGym("Portal Gym");
  const plan = await inGym(owner, (tx) =>
    createPlan(tx, owner, { name: "Monthly", description: null, durationUnit: "months", durationValue: 1, price: 150000, admissionFee: 0, isActive: true }),
  );
  const add = (fullName: string, notes: string | null = null) =>
    inGym(owner, (tx) => createMember(tx, owner, { ...memberBase, fullName, phone: uniquePhone(), notes }));
  const a = await add("Aswathy Raj", "Pays late - remind politely");
  const b = await add("Bibin Thomas");
  await inGym(owner, (tx) =>
    sellMembership(tx, owner, {
      memberId: a.id, planId: plan.id, startDate: null, chargeAdmission: false, discountType: "amount", discountValue: null, discountNote: null,
      payNow: true, payment: { amount: 100000, method: "upi", reference: null },
    } as never),
  );
  for (const m of [a, b]) {
    await inGym(owner, (tx) =>
      updateFitnessProfile(tx, owner, m.id, { fitnessGoal: "general_fitness", experienceLevel: "beginner", trainingDaysPerWeek: 3, sessionMinutes: 60, exercisePreferences: null, limitations: null, limitationTags: [] }),
    );
  }
  // Members join before plans are approved, so they get the "plan ready" notification.
  const ctxA = await joinAsMember(owner, a.id);
  const ctxB = await joinAsMember(owner, b.id);
  const planA = await generatePlan(owner, { memberId: a.id, mode: "template", instructions: null });
  await inGym(owner, (tx) => approvePlan(tx, owner, planA.planId, { acknowledgeWarnings: true }));
  const planB = await generatePlan(owner, { memberId: b.id, mode: "template", instructions: null });
  await inGym(owner, (tx) => approvePlan(tx, owner, planB.planId, { acknowledgeWarnings: true }));
  const detail = await inGym(ctxA, (tx) => getPlanDetail(tx, ctxA, planA.planId));
  return { owner, a, b, ctxA, ctxB, planA: planA.planId, planB: planB.planId, day: detail.content.days[0]! };
}

const code = (e: unknown) => (e instanceof AppError ? e.status : String(e));

describe("member portal", () => {
  beforeEach(resetDb);

  it("shows the member their membership, dues, plan and notifications, without staff notes", async () => {
    const { ctxA, a } = await setup();
    expect(ctxA.role).toBe("member");
    const home = await inGym(ctxA, (tx) => memberHome(tx, ctxA));
    expect(home.member.fullName).toBe("Aswathy Raj");
    expect(home.member.standing).toBe("active");
    expect(home.outstandingPaise).toBe(50000); // ₹1,500 plan, ₹1,000 paid
    expect(home.plan?.content.days.length).toBeGreaterThan(0);
    expect(home.notifications.items.some((n) => n.type === "plan.approved")).toBe(true);
    expect(JSON.stringify(home)).not.toContain("Pays late");
    expect("notes" in home.member).toBe(false);
    expect("qrToken" in home.member).toBe(false);

    const full = await inGym(ctxA, (tx) => getMember(tx, ctxA, a.id));
    expect(Object.keys(selfView(full))).not.toContain("notes");

    const billing = await inGym(ctxA, (tx) => memberBilling(tx, ctxA));
    expect(billing.payments).toHaveLength(1);
    expect(billing.payments[0]!.receiptNumber).toMatch(/\/0001$/);
  });

  it("keeps members out of each other's data", async () => {
    const { ctxA, b, planB } = await setup();
    const attempts = [
      () => inGym(ctxA, (tx) => getMember(tx, ctxA, b.id)),
      () => inGym(ctxA, (tx) => listWorkoutLogs(tx, ctxA, b.id)),
      () => inGym(ctxA, (tx) => listProgress(tx, ctxA, b.id)),
      () => inGym(ctxA, (tx) => addProgressEntry(tx, ctxA, b.id, progressEntrySchema.parse({ weightKg: 70 }))),
      () => inGym(ctxA, (tx) => getPlanDetail(tx, ctxA, planB)),
    ];
    for (const attempt of attempts) {
      const err = await attempt().catch((e) => e);
      expect([403, 404]).toContain(code(err));
    }
    // Logging against someone else's plan from your own record is refused too.
    const own = await inGym(ctxA, (tx) => memberHome(tx, ctxA));
    const err = await inGym(ctxA, (tx) =>
      logWorkout(tx, ctxA, own.member.id, workoutLogSchema.parse({ planId: planB, dayKey: "day1", entries: [{ exerciseId: "x", done: true }] })),
    ).catch((e) => e);
    expect(code(err)).toBe(404);
  });

  it("hides plans that a trainer hasn't approved", async () => {
    const { owner, ctxA, a } = await setup();
    const draft = await generatePlan(owner, { memberId: a.id, mode: "template", instructions: null });
    const err = await inGym(ctxA, (tx) => getPlanDetail(tx, ctxA, draft.planId)).catch((e) => e);
    expect(code(err)).toBe(404);
  });

  it("logs a workout day, updates it on a second save and validates dates and exercises", async () => {
    const { ctxA, a, planA, day } = await setup();
    const today = todayIn(ctxA.gym.timezone);
    const entries = day.exercises.map((e, i) => ({ exerciseId: e.exerciseId, done: i === 0, weightKg: i === 0 ? "22.5" : null }));
    const input = (over: Record<string, unknown> = {}) => workoutLogSchema.parse({ planId: planA, dayKey: day.key, entries, difficulty: 3, ...over });

    const first = await inGym(ctxA, (tx) => logWorkout(tx, ctxA, a.id, input()));
    expect(first.completedExercises).toBe(1);
    expect(first.totalExercises).toBe(day.exercises.length);
    expect(first.performedOn).toBe(today);

    const allDone = entries.map((e) => ({ ...e, done: true }));
    const second = await inGym(ctxA, (tx) => logWorkout(tx, ctxA, a.id, input({ entries: allDone, notes: "Felt strong" })));
    expect(second.id).toBe(first.id);
    expect(second.completedExercises).toBe(day.exercises.length);

    const { logs, last7Days } = await inGym(ctxA, (tx) => listWorkoutLogs(tx, ctxA, a.id));
    expect(logs).toHaveLength(1);
    expect(logs[0]!.notes).toBe("Felt strong");
    expect(last7Days).toBe(1);

    for (const bad of [
      input({ performedOn: addDays(today, 1) }),
      input({ performedOn: addDays(today, -8) }),
      input({ dayKey: "nope" }),
      input({ entries: [{ exerciseId: "Not_In_Plan", done: true }] }),
    ]) {
      const err = await inGym(ctxA, (tx) => logWorkout(tx, ctxA, a.id, bad)).catch((e) => e);
      expect(code(err)).toBe(400);
    }
    // Backfilling within the week is fine.
    await inGym(ctxA, (tx) => logWorkout(tx, ctxA, a.id, input({ performedOn: addDays(today, -3) })));
  });

  it("records progress and lets only the member or their coach change it", async () => {
    const { owner, ctxA, ctxB, a } = await setup();
    expect(() => progressEntrySchema.parse({ notes: "nothing measured" })).toThrow(/at least one measurement/);
    expect(() => progressEntrySchema.parse({ weightKg: "900" })).toThrow(/between 20 and 300/);

    const entry = await inGym(ctxA, (tx) => addProgressEntry(tx, ctxA, a.id, progressEntrySchema.parse({ weightKg: "72,4", waistCm: 84 })));
    expect(entry.weightKg).toBe(72.4);
    expect(entry.measurements).toEqual({ waistCm: 84 });

    // Trainer assigned to the member can add a measurement taken at the gym.
    const inv = await inGym(owner, (tx) => inviteStaff(tx, owner, { fullName: "Coach", phone: uniquePhone(), email: null, role: "trainer", specializations: [] }));
    const t = await acceptInvite({ token: inv.inviteUrl.split("/").pop()!, password: "coach-pass" }, null, meta);
    const trainer = await contextFor(t.token!);
    const denied = await inGym(trainer, (tx) => listProgress(tx, trainer, a.id)).catch((e) => e);
    expect([403, 404]).toContain(code(denied));
    await inGym(owner, (tx) => assignTrainer(tx, owner, a.id, trainer.staffId!));
    await inGym(trainer, (tx) => addProgressEntry(tx, trainer, a.id, progressEntrySchema.parse({ bodyFatPct: 21.5 })));
    expect(await inGym(ctxA, (tx) => listProgress(tx, ctxA, a.id))).toHaveLength(2);

    const notYours = await inGym(ctxB, (tx) => deleteProgressEntry(tx, ctxB, entry.id)).catch((e) => e);
    expect([403, 404]).toContain(code(notYours));
    await inGym(ctxA, (tx) => deleteProgressEntry(tx, ctxA, entry.id));
    expect(await inGym(ctxA, (tx) => listProgress(tx, ctxA, a.id))).toHaveLength(1);
  });

  it("doesn't let a member clear their own pending medical clearance", async () => {
    const { owner, ctxA, a } = await setup();
    await inGym(ctxA, (tx) => saveHealthScreening(tx, ctxA, a.id, { ...NO, chestPain: true }));
    expect((await inGym(owner, (tx) => getMember(tx, owner, a.id))).fitness.medicalClearanceRequired).toBe(true);
    await inGym(ctxA, (tx) => saveHealthScreening(tx, ctxA, a.id, NO));
    expect((await inGym(owner, (tx) => getMember(tx, owner, a.id))).fitness.medicalClearanceRequired).toBe(true);

    await inGym(owner, (tx) => recordClearance(tx, owner, a.id, "Doctor's letter seen"));
    await inGym(ctxA, (tx) => saveHealthScreening(tx, ctxA, a.id, NO));
    const after = await inGym(owner, (tx) => getMember(tx, owner, a.id));
    expect(after.fitness.medicalClearanceRequired).toBe(false);
    expect(after.fitness.healthScreening?.answeredBy).toBe("member");
  });
});
