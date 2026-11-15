import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { z } from "zod";
import { CLEARANCE_REQUIRED } from "@/shared/exercise-safety";
import { planContentSchema, type PlanContent, type FitnessGoal, type fitnessProfileSchema, type healthScreeningSchema, type planUpdateSchema } from "@/shared/schemas/workout";
import { aiBlockingIssues, checkPlan, type ExerciseMeta, type PlanIssue } from "@/shared/workout-rules";
import { hasPermission, inGym, requirePermission, type GymContext } from "../../auth/context";
import { aiGenerations, members, workoutPlanVersions, workoutPlans } from "../../db/schema";
import type { Tx } from "../../db/tx";
import { badRequest, conflict, forbidden, notFound } from "../../errors";
import { logger, errorFields } from "../../logger";
import { AiRefusedError, costMicroUsd, workoutAI, type AiPlan, type WorkoutAIInput } from "../ai/workout-ai";
import { audit } from "../audit";
import { candidatesFor, exerciseMap } from "../exercises/service";
import { getMember, gymToday, type MemberDetail } from "../members/service";
import { notifyPlanApproved, notifyPlanSubmitted } from "../notifications/service";
import { generateTemplatePlan } from "./template";

/* ------------------------------------------------------------ profile */

export function assertCanCoach(ctx: GymContext, member: MemberDetail) {
  if (ctx.memberId === member.id) return;
  if (!hasPermission(ctx, "workouts.manage") && !hasPermission(ctx, "members.manage")) throw forbidden();
  if (!hasPermission(ctx, "members.view_all") && member.assignedTrainerId !== ctx.staffId) {
    throw forbidden("This member isn't assigned to you.");
  }
}

export async function updateFitnessProfile(tx: Tx, ctx: GymContext, memberId: string, input: z.output<typeof fitnessProfileSchema>) {
  const member = await getMember(tx, ctx, memberId);
  assertCanCoach(ctx, member);
  const needsClearance = input.limitationTags.some((t) => CLEARANCE_REQUIRED.has(t));
  const hadClearanceTags = member.fitness.limitationTags.some((t) => CLEARANCE_REQUIRED.has(t as never));
  await tx
    .update(members)
    .set({
      fitnessGoal: input.fitnessGoal,
      experienceLevel: input.experienceLevel,
      trainingDaysPerWeek: input.trainingDaysPerWeek,
      sessionMinutes: input.sessionMinutes,
      exercisePreferences: input.exercisePreferences,
      limitations: input.limitations,
      limitationTags: input.limitationTags,
      // A newly reported condition needs fresh clearance.
      ...(needsClearance && !hadClearanceTags ? { medicalClearanceRequired: true, medicalClearanceNote: null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(members.id, memberId), eq(members.gymId, ctx.gym.id)));
  await audit(tx, ctx, "member.fitness_profile", "member", memberId);
}

/** PAR-Q style screening. Any "yes" means a trainer must record clearance before plans are generated. */
export async function saveHealthScreening(tx: Tx, ctx: GymContext, memberId: string, answers: z.output<typeof healthScreeningSchema>) {
  const member = await getMember(tx, ctx, memberId);
  assertCanCoach(ctx, member);
  const anyYes = Object.values(answers).some(Boolean);
  // A member can't lift a pending clearance by re-answering "no" to everything;
  // only staff who can approve plans clear it (recordClearance).
  const stillPending = ctx.memberId === memberId && member.fitness.medicalClearanceRequired;
  await tx
    .update(members)
    .set({
      healthScreening: { ...answers, answeredAt: new Date().toISOString(), answeredBy: ctx.memberId === memberId ? "member" : "staff" },
      medicalClearanceRequired: anyYes || stillPending,
      medicalClearanceNote: anyYes ? null : member.fitness.medicalClearanceNote,
      updatedAt: new Date(),
    })
    .where(and(eq(members.id, memberId), eq(members.gymId, ctx.gym.id)));
  await audit(tx, ctx, "member.health_screening", "member", memberId, { anyYes });
}

export async function recordClearance(tx: Tx, ctx: GymContext, memberId: string, note: string) {
  requirePermission(ctx, "workouts.approve");
  const member = await getMember(tx, ctx, memberId);
  assertCanCoach(ctx, member);
  await tx
    .update(members)
    .set({ medicalClearanceRequired: false, medicalClearanceNote: note, updatedAt: new Date() })
    .where(and(eq(members.id, memberId), eq(members.gymId, ctx.gym.id)));
  await audit(tx, ctx, "member.clearance", "member", memberId, { note });
}

/* ------------------------------------------------------------ generation */

export type GenerationOutcome = {
  planId: string;
  source: "ai" | "template" | "manual";
  notice: string | null;
};

function ageFrom(dob: string | null, today: string): number | null {
  if (!dob) return null;
  const [y, m, d] = dob.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

/** Converts the model's draft to FITO's plan format and collects every problem. */
export function draftToContent(draft: AiPlan, check: Parameters<typeof checkPlan>[1]): { content: PlanContent | null; problems: string[] } {
  const parsed = planContentSchema.safeParse({
    warmup: draft.warmup,
    cooldown: draft.cooldown,
    notes: draft.notes,
    days: draft.days.map((d, i) => ({
      key: `day${i + 1}`,
      title: d.title || `Day ${i + 1}`,
      focus: d.focus,
      weekday: Number.isInteger(d.weekday) && d.weekday >= 0 && d.weekday <= 6 ? d.weekday : null,
      exercises: d.exercises.map((e) => ({ ...e, reps: e.reps.trim() })),
    })),
  });
  if (!parsed.success) {
    return { content: null, problems: [...new Set(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`))] };
  }
  const blocking = aiBlockingIssues(checkPlan(parsed.data, check));
  return { content: parsed.data, problems: blocking.map((i) => i.message) };
}

async function aiCallsThisMonth(tx: Tx, ctx: GymContext) {
  const monthStart = `${gymToday(ctx).slice(0, 8)}01`;
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(aiGenerations)
    .where(
      and(
        eq(aiGenerations.gymId, ctx.gym.id),
        eq(aiGenerations.provider, "anthropic"),
        sql`(${aiGenerations.createdAt} at time zone ${ctx.gym.timezone})::date >= ${monthStart}::date`,
      ),
    );
  return r?.n ?? 0;
}

export function aiMonthlyLimit(ctx: GymContext) {
  return ctx.gym.settings.aiMonthlyLimit ?? 100;
}

export async function aiUsage(tx: Tx, ctx: GymContext) {
  const monthStart = `${gymToday(ctx).slice(0, 8)}01`;
  const [r] = await tx
    .select({
      calls: sql<number>`count(*) filter (where ${aiGenerations.provider} = 'anthropic')::int`,
      inputTokens: sql<number>`coalesce(sum(${aiGenerations.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${aiGenerations.outputTokens}), 0)::int`,
      costMicroUsd: sql<number>`coalesce(sum(${aiGenerations.costMicroUsd}), 0)::bigint`,
    })
    .from(aiGenerations)
    .where(and(eq(aiGenerations.gymId, ctx.gym.id), sql`(${aiGenerations.createdAt} at time zone ${ctx.gym.timezone})::date >= ${monthStart}::date`));
  return {
    calls: r?.calls ?? 0,
    limit: aiMonthlyLimit(ctx),
    inputTokens: r?.inputTokens ?? 0,
    outputTokens: r?.outputTokens ?? 0,
    costUsd: Number(r?.costMicroUsd ?? 0) / 1_000_000,
    configured: workoutAI() !== null,
  };
}

/**
 * Creates a workout plan for a member: AI draft (validated, one retry with
 * the problems fed back), a rule-based template, or a blank draft. Generated
 * plans are saved as "pending review": nothing reaches the member until a
 * trainer approves it. The AI call runs outside any database transaction.
 */
export async function generatePlan(
  ctx: GymContext,
  input: { memberId: string; mode: "ai" | "template" | "blank"; instructions: string | null },
): Promise<GenerationOutcome> {
  requirePermission(ctx, input.mode === "ai" ? "ai.generate" : "workouts.manage");

  // 1. Gather inputs (short transaction)
  const prep = await inGym(ctx, async (tx) => {
    const member = await getMember(tx, ctx, input.memberId);
    if (ctx.memberId === member.id) throw forbidden();
    assertCanCoach(ctx, member);
    if (member.status === "inactive") throw badRequest("This member is deactivated.");
    const f = member.fitness;
    if (input.mode !== "blank" && (!f.fitnessGoal || !f.experienceLevel || !f.trainingDaysPerWeek || !f.sessionMinutes)) {
      throw badRequest("Complete the member's fitness profile (goal, level, days per week, minutes) first.");
    }
    if (input.mode !== "blank" && f.medicalClearanceRequired) {
      if (input.mode === "ai") {
        await tx.insert(aiGenerations).values({
          gymId: ctx.gym.id,
          memberId: member.id,
          requestedByStaffId: ctx.staffId,
          provider: "fito",
          status: "blocked",
          errorMessage: "Medical clearance required",
        });
      }
      throw conflict("This member's health screening needs a trainer's clearance before a plan can be generated. Record the clearance on their profile first.");
    }
    const candidates = input.mode === "blank" ? [] : await candidatesFor(tx, ctx, { experienceLevel: f.experienceLevel!, limitationTags: f.limitationTags });
    const quotaUsed = input.mode === "ai" ? await aiCallsThisMonth(tx, ctx) : 0;
    return { member, candidates, quotaUsed };
  });

  const { member, candidates } = prep;
  const f = member.fitness;
  const check = {
    exercises: new Map<string, ExerciseMeta>(candidates.map((c) => [c.id, c])),
    experienceLevel: f.experienceLevel,
    limitationTags: f.limitationTags,
    trainingDaysPerWeek: f.trainingDaysPerWeek,
    sessionMinutes: f.sessionMinutes,
    availableEquipment: ctx.gym.settings.availableEquipment ?? [],
  };
  if (input.mode !== "blank" && candidates.length < 12) {
    throw badRequest("Too few suitable exercises for this member. Check the gym's equipment list in Settings.");
  }

  let source: GenerationOutcome["source"] = input.mode === "blank" ? "manual" : input.mode === "ai" ? "ai" : "template";
  let notice: string | null = null;
  let name = `Plan for ${member.fullName.split(" ")[0]}`;
  let content: PlanContent | null = null;
  let rationale: string | null = null;
  const log = {
    attempted: false,
    status: "succeeded" as "succeeded" | "failed" | "invalid_output",
    model: null as string | null,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    problems: [] as string[],
    error: null as string | null,
    output: null as unknown,
  };

  // 2. AI draft (no transaction held open)
  if (input.mode === "ai") {
    const ai = workoutAI();
    if (!ai) {
      source = "template";
      notice = "AI isn't configured for FITO yet, so this plan was built from FITO's templates.";
    } else if (prep.quotaUsed >= aiMonthlyLimit(ctx)) {
      source = "template";
      notice = `Your gym has used this month's ${aiMonthlyLimit(ctx)} AI generations, so this plan was built from templates.`;
    } else {
      log.attempted = true;
      log.model = ai.model;
      const started = Date.now();
      const aiInput: WorkoutAIInput = {
        goal: f.fitnessGoal!,
        level: f.experienceLevel!,
        daysPerWeek: f.trainingDaysPerWeek!,
        sessionMinutes: f.sessionMinutes!,
        age: ageFrom(member.dateOfBirth, gymToday(ctx)),
        gender: member.gender && member.gender !== "undisclosed" ? member.gender : null,
        preferences: f.exercisePreferences,
        limitations: f.limitations,
        limitationTags: f.limitationTags,
        trainerInstructions: input.instructions,
        candidates,
      };
      try {
        for (let attempt = 1; attempt <= 2 && !content; attempt++) {
          const result = await ai.draftPlan(attempt === 1 ? aiInput : { ...aiInput, previousErrors: log.problems });
          log.model = result.model;
          log.inputTokens += result.inputTokens;
          log.outputTokens += result.outputTokens;
          log.output = result.draft;
          const converted = draftToContent(result.draft, check);
          if (converted.content && converted.problems.length === 0) {
            content = converted.content;
            name = result.draft.name.trim().slice(0, 80) || name;
            rationale = result.draft.rationale.trim().slice(0, 1000) || null;
          } else {
            log.problems = converted.problems.slice(0, 20);
          }
        }
        if (!content) {
          log.status = "invalid_output";
          source = "template";
          notice = "The AI draft didn't pass FITO's safety and library checks twice, so this plan was built from templates instead.";
        }
      } catch (err) {
        log.status = "failed";
        log.error = err instanceof Error ? err.message.slice(0, 500) : String(err);
        source = "template";
        notice =
          err instanceof AiRefusedError
            ? "The AI declined this request, so this plan was built from templates."
            : "The AI service couldn't be reached, so this plan was built from templates.";
        logger.warn("ai_workout_failed", { gymId: ctx.gym.id, ...errorFields(err) });
      }
      log.latencyMs = Date.now() - started;
    }
  }

  if (!content && source === "template") {
    const t = generateTemplatePlan({
      seed: member.id,
      goal: f.fitnessGoal as FitnessGoal,
      level: f.experienceLevel!,
      daysPerWeek: f.trainingDaysPerWeek!,
      sessionMinutes: f.sessionMinutes!,
      candidates,
    });
    name = t.name;
    content = t.content;
  }
  if (!content) {
    content = { days: [], warmup: "", cooldown: "", notes: "" };
  }

  // 3. Save (short transaction)
  return inGym(ctx, async (tx) => {
    let aiGenerationId: string | null = null;
    if (log.attempted) {
      const [g] = await tx
        .insert(aiGenerations)
        .values({
          gymId: ctx.gym.id,
          memberId: member.id,
          requestedByStaffId: ctx.staffId,
          provider: "anthropic",
          model: log.model,
          status: log.status === "succeeded" ? "succeeded" : log.status,
          input: { goal: f.fitnessGoal, level: f.experienceLevel, days: f.trainingDaysPerWeek, minutes: f.sessionMinutes, limitationTags: f.limitationTags, candidates: candidates.length },
          output: (log.output ?? null) as never,
          validationErrors: log.problems.length ? log.problems : null,
          errorMessage: log.error,
          inputTokens: log.inputTokens,
          outputTokens: log.outputTokens,
          costMicroUsd: log.model ? costMicroUsd(log.model, log.inputTokens, log.outputTokens) : 0,
          latencyMs: log.latencyMs,
        })
        .returning({ id: aiGenerations.id });
      aiGenerationId = g!.id;
    }
    const [plan] = await tx
      .insert(workoutPlans)
      .values({
        gymId: ctx.gym.id,
        memberId: member.id,
        trainerId: member.assignedTrainerId ?? ctx.staffId,
        name,
        goal: f.fitnessGoal,
        status: source === "manual" ? "draft" : "pending_review",
        source,
        currentVersion: 1,
        createdByStaffId: ctx.staffId,
      })
      .returning();
    await tx.insert(workoutPlanVersions).values({
      gymId: ctx.gym.id,
      planId: plan!.id,
      version: 1,
      content: content!,
      changeSummary: source === "ai" ? `AI draft${rationale ? `: ${rationale}` : ""}` : source === "template" ? `Template draft${notice ? ` (${notice})` : ""}` : "Blank plan",
      aiGenerationId,
      createdByStaffId: ctx.staffId,
    });
    await audit(tx, ctx, "plan.create", "workout_plan", plan!.id, { source, mode: input.mode });
    if (plan!.trainerId && plan!.trainerId !== ctx.staffId && source !== "manual") {
      await notifyPlanSubmitted(tx, ctx, plan!.id, member.fullName, plan!.trainerId);
    }
    return { planId: plan!.id, source, notice };
  });
}

/* ------------------------------------------------------------ plan CRUD */

export async function loadPlan(tx: Tx, ctx: GymContext, planId: string) {
  const [plan] = await tx.select().from(workoutPlans).where(and(eq(workoutPlans.id, planId), eq(workoutPlans.gymId, ctx.gym.id)));
  if (!plan) throw notFound("Workout plan not found.");
  return plan;
}

async function loadEditable(tx: Tx, ctx: GymContext, planId: string) {
  const plan = await loadPlan(tx, ctx, planId);
  const member = await getMember(tx, ctx, plan.memberId);
  if (ctx.memberId === member.id) throw forbidden();
  requirePermission(ctx, "workouts.manage");
  assertCanCoach(ctx, member);
  return { plan, member };
}

export async function currentContent(tx: Tx, planId: string, version: number): Promise<PlanContent> {
  const [v] = await tx
    .select({ content: workoutPlanVersions.content })
    .from(workoutPlanVersions)
    .where(and(eq(workoutPlanVersions.planId, planId), eq(workoutPlanVersions.version, version)));
  return planContentSchema.parse(v?.content ?? { days: [] });
}

export async function issuesFor(tx: Tx, ctx: GymContext, content: PlanContent, member: MemberDetail): Promise<PlanIssue[]> {
  const map = await exerciseMap(tx, ctx, content.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)));
  return checkPlan(content, {
    exercises: map,
    experienceLevel: member.fitness.experienceLevel,
    limitationTags: member.fitness.limitationTags,
    trainingDaysPerWeek: member.fitness.trainingDaysPerWeek,
    sessionMinutes: member.fitness.sessionMinutes,
    availableEquipment: ctx.gym.settings.availableEquipment ?? [],
  });
}

export async function getPlanDetail(tx: Tx, ctx: GymContext, planId: string) {
  const plan = await loadPlan(tx, ctx, planId);
  const member = await getMember(tx, ctx, plan.memberId);
  const isSelf = ctx.memberId === member.id;
  if (isSelf) {
    if (plan.status !== "active" && plan.status !== "archived") throw notFound("Workout plan not found.");
  } else {
    assertCanCoach(ctx, member);
  }
  const content = await currentContent(tx, plan.id, plan.currentVersion);
  const versions = await tx
    .select({
      version: workoutPlanVersions.version,
      changeSummary: workoutPlanVersions.changeSummary,
      createdAt: workoutPlanVersions.createdAt,
      aiGenerationId: workoutPlanVersions.aiGenerationId,
      createdBy: sql<string | null>`(select s.full_name from gym_staff s where s.id = ${workoutPlanVersions.createdByStaffId})`,
    })
    .from(workoutPlanVersions)
    .where(eq(workoutPlanVersions.planId, plan.id))
    .orderBy(desc(workoutPlanVersions.version));
  const map = await exerciseMap(tx, ctx, content.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)));
  const aiId = versions.find((v) => v.aiGenerationId)?.aiGenerationId;
  const [ai] = aiId && !isSelf ? await tx.select().from(aiGenerations).where(eq(aiGenerations.id, aiId)) : [];
  const [approver] = plan.approvedByStaffId
    ? ((await tx.execute(sql`select full_name from gym_staff where id = ${plan.approvedByStaffId}`)).rows as { full_name: string }[])
    : [];
  return {
    plan,
    member: { id: member.id, fullName: member.fullName, memberCode: member.memberCode, fitness: member.fitness, trainerName: member.trainerName },
    content,
    exercises: Object.fromEntries(map),
    versions,
    issues: isSelf ? [] : await issuesFor(tx, ctx, content, member),
    ai: ai ? { model: ai.model, status: ai.status, inputTokens: ai.inputTokens, outputTokens: ai.outputTokens, latencyMs: ai.latencyMs, validationErrors: ai.validationErrors } : null,
    approvedBy: approver?.full_name ?? null,
  };
}

export async function listPlans(tx: Tx, ctx: GymContext, filter: { status?: string; memberId?: string }) {
  requirePermission(ctx, "workouts.manage");
  const conds = [eq(workoutPlans.gymId, ctx.gym.id)];
  if (filter.status) conds.push(eq(workoutPlans.status, filter.status as never));
  if (filter.memberId) conds.push(eq(workoutPlans.memberId, filter.memberId));
  if (!hasPermission(ctx, "members.view_all")) {
    conds.push(sql`${workoutPlans.memberId} in (select m.id from members m where m.assigned_trainer_id = ${ctx.staffId ?? "00000000-0000-0000-0000-000000000000"})`);
  }
  return tx
    .select({
      id: workoutPlans.id,
      name: workoutPlans.name,
      status: workoutPlans.status,
      source: workoutPlans.source,
      goal: workoutPlans.goal,
      currentVersion: workoutPlans.currentVersion,
      updatedAt: workoutPlans.updatedAt,
      approvedAt: workoutPlans.approvedAt,
      memberId: workoutPlans.memberId,
      memberName: members.fullName,
      memberCode: members.memberCode,
      trainerName: sql<string | null>`(select s.full_name from gym_staff s where s.id = ${workoutPlans.trainerId})`,
    })
    .from(workoutPlans)
    .innerJoin(members, eq(members.id, workoutPlans.memberId))
    .where(and(...conds))
    .orderBy(desc(workoutPlans.updatedAt))
    .limit(200);
}

export async function planCounts(tx: Tx, ctx: GymContext) {
  requirePermission(ctx, "workouts.manage");
  const scope = hasPermission(ctx, "members.view_all")
    ? sql`true`
    : sql`p.member_id in (select m.id from members m where m.assigned_trainer_id = ${ctx.staffId ?? "00000000-0000-0000-0000-000000000000"})`;
  const rows = (await tx.execute(sql`select p.status, count(*)::int as n from workout_plans p where p.gym_id = ${ctx.gym.id} and ${scope} group by 1`)).rows as { status: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
}

const EDITABLE = new Set(["draft", "pending_review", "rejected"]);

/** Saves trainer edits as a new version (the previous versions are kept). */
export async function updatePlan(tx: Tx, ctx: GymContext, planId: string, input: z.output<typeof planUpdateSchema>) {
  const { plan } = await loadEditable(tx, ctx, planId);
  if (!EDITABLE.has(plan.status)) throw conflict("Active and archived plans can't be edited. Use “Revise” to create a new version for approval.");
  const exists = await exerciseMap(tx, ctx, input.content.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)));
  const unknown = input.content.days.flatMap((d) => d.exercises.filter((e) => !exists.has(e.exerciseId)).map((e) => e.exerciseId));
  if (unknown.length) throw badRequest(`Unknown exercise: ${unknown[0]}`);
  const version = plan.currentVersion + 1;
  await tx.insert(workoutPlanVersions).values({
    gymId: ctx.gym.id,
    planId: plan.id,
    version,
    content: input.content,
    changeSummary: input.changeSummary ?? "Edited by trainer",
    createdByStaffId: ctx.staffId,
  });
  await tx
    .update(workoutPlans)
    .set({
      name: input.name,
      goal: input.goal ?? plan.goal,
      currentVersion: version,
      status: plan.status === "rejected" ? "draft" : plan.status,
      rejectedReason: null,
      updatedAt: new Date(),
    })
    .where(eq(workoutPlans.id, plan.id));
  await audit(tx, ctx, "plan.edit", "workout_plan", plan.id, { version });
  return { version };
}

/**
 * Trainer approval: the only way a plan becomes active and visible to the
 * member. Unknown exercises block approval; safety warnings must be
 * acknowledged explicitly.
 */
export async function approvePlan(tx: Tx, ctx: GymContext, planId: string, opts: { acknowledgeWarnings: boolean }) {
  requirePermission(ctx, "workouts.approve");
  const { plan, member } = await loadEditable(tx, ctx, planId);
  if (plan.status !== "pending_review" && plan.status !== "draft") throw conflict("Only drafts or plans awaiting review can be approved.");
  if (member.fitness.medicalClearanceRequired) throw conflict("Record the member's medical clearance before approving a plan.");
  const content = await currentContent(tx, plan.id, plan.currentVersion);
  if (content.days.length === 0) throw badRequest("Add at least one workout day before approving.");
  const issues = await issuesFor(tx, ctx, content, member);
  const errors = issues.filter((i) => i.level === "error");
  if (errors.length) throw badRequest(errors[0]!.message);
  if (issues.length && !opts.acknowledgeWarnings) {
    throw conflict("Review the safety notes on this plan and confirm before approving.", { warnings: issues.map((i) => i.message) });
  }
  await tx
    .update(workoutPlans)
    .set({ status: "archived", updatedAt: new Date() })
    .where(and(eq(workoutPlans.gymId, ctx.gym.id), eq(workoutPlans.memberId, member.id), eq(workoutPlans.status, "active")));
  await tx
    .update(workoutPlans)
    .set({ status: "active", approvedByStaffId: ctx.staffId, approvedAt: new Date(), startDate: gymToday(ctx), rejectedReason: null, updatedAt: new Date() })
    .where(eq(workoutPlans.id, plan.id));
  await audit(tx, ctx, "plan.approve", "workout_plan", plan.id, { version: plan.currentVersion, acknowledgedWarnings: issues.length });
  await notifyPlanApproved(tx, ctx, member.id, plan.name);
}

export async function rejectPlan(tx: Tx, ctx: GymContext, planId: string, reason: string) {
  requirePermission(ctx, "workouts.approve");
  const { plan } = await loadEditable(tx, ctx, planId);
  if (plan.status !== "pending_review" && plan.status !== "draft") throw conflict("Only plans awaiting review can be rejected.");
  await tx.update(workoutPlans).set({ status: "rejected", rejectedReason: reason, updatedAt: new Date() }).where(eq(workoutPlans.id, plan.id));
  await audit(tx, ctx, "plan.reject", "workout_plan", plan.id, { reason });
}

export async function archivePlan(tx: Tx, ctx: GymContext, planId: string) {
  const { plan } = await loadEditable(tx, ctx, planId);
  if (plan.status === "archived") return;
  await tx.update(workoutPlans).set({ status: "archived", updatedAt: new Date() }).where(eq(workoutPlans.id, plan.id));
  await audit(tx, ctx, "plan.archive", "workout_plan", plan.id);
}

/** Copies an active/archived plan into a new draft. The current plan stays live until the copy is approved. */
export async function revisePlan(tx: Tx, ctx: GymContext, planId: string) {
  const { plan, member } = await loadEditable(tx, ctx, planId);
  const content = await currentContent(tx, plan.id, plan.currentVersion);
  const [copy] = await tx
    .insert(workoutPlans)
    .values({
      gymId: ctx.gym.id,
      memberId: member.id,
      trainerId: plan.trainerId,
      name: plan.name,
      goal: plan.goal,
      status: "draft",
      source: "manual",
      currentVersion: 1,
      createdByStaffId: ctx.staffId,
    })
    .returning({ id: workoutPlans.id });
  await tx.insert(workoutPlanVersions).values({
    gymId: ctx.gym.id,
    planId: copy!.id,
    version: 1,
    content,
    changeSummary: `Revision of "${plan.name}" (v${plan.currentVersion})`,
    createdByStaffId: ctx.staffId,
  });
  await audit(tx, ctx, "plan.revise", "workout_plan", copy!.id, { from: plan.id });
  return { planId: copy!.id };
}

/** The member's approved plan (for the member portal and trainer views). */
export async function activePlanFor(tx: Tx, ctx: GymContext, memberId: string) {
  const [plan] = await tx
    .select({ id: workoutPlans.id })
    .from(workoutPlans)
    .where(and(eq(workoutPlans.gymId, ctx.gym.id), eq(workoutPlans.memberId, memberId), eq(workoutPlans.status, "active")));
  return plan ? getPlanDetail(tx, ctx, plan.id) : null;
}

export async function memberPlans(tx: Tx, ctx: GymContext, memberId: string) {
  return tx
    .select({ id: workoutPlans.id, name: workoutPlans.name, status: workoutPlans.status, source: workoutPlans.source, updatedAt: workoutPlans.updatedAt })
    .from(workoutPlans)
    .where(and(eq(workoutPlans.gymId, ctx.gym.id), eq(workoutPlans.memberId, memberId), inArray(workoutPlans.status, ["draft", "pending_review", "active", "rejected"])))
    .orderBy(desc(workoutPlans.updatedAt));
}
