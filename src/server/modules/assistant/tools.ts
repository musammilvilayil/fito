import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { batchHoursLabel, batchHoursOf } from "@/shared/batches";
import { addDays, diffDays, formatDate, isISODate, type ISODate } from "@/shared/dates";
import { STANDING_LABELS, type MemberStanding } from "@/shared/membership";
import { formatINR } from "@/shared/money";
import { memberListQuery } from "@/shared/schemas/member";
import { GOAL_LABELS, exerciseQuery, progressEntrySchema, type FitnessGoal } from "@/shared/schemas/workout";
import { suggestDay } from "@/shared/workout-schedule";
import { hasPermission, inGym, type GymContext } from "../../auth/context";
import { badRequest } from "../../errors";
import { CROWD_LABELS, gymCrowd } from "../attendance/crowd";
import { attendanceSummary, memberAttendance } from "../attendance/service";
import { listEquipment } from "../equipment/service";
import { searchExercises } from "../exercises/service";
import { getGymProfile } from "../gyms/service";
import { listMemberMemberships } from "../memberships/service";
import { getMember, gymToday, listMembers, soonDays, visibilityFilter } from "../members/service";
import { currentMembershipJoin, standingExpr } from "../members/standing";
import { dailyCollections, duesForMember, listDues, paymentSummary } from "../payments/service";
import { listStaff, listTrainers } from "../staff/service";
import { activePlanFor, assertCanCoach, listPlans } from "../workouts/service";
import { listProgress, listWorkoutLogs } from "../workouts/tracking";

/**
 * The assistant's only way to reach FITO data. Every tool runs with the
 * signed-in person's own context, so the same permission checks and row-level
 * security apply as everywhere else. Nothing here writes data: tools that
 * would change something return a proposal the person must confirm.
 */

export type Persona = "member" | "staff";
export const personaFor = (ctx: GymContext): Persona => (ctx.role === "member" ? "member" : "staff");

export type Proposal = { type: "progress_entry"; payload: { memberId: string; entry: z.input<typeof progressEntrySchema> }; summary: string };
export type ToolOutcome = { data: unknown } | { proposal: Proposal };

type AnyTool = {
  name: string;
  label: string;
  description: string;
  input: z.ZodObject;
  personas: Persona[];
  allowed: (ctx: GymContext) => boolean;
  run: (ctx: GymContext, input: never) => Promise<ToolOutcome>;
};

function tool<S extends z.ZodObject>(t: {
  name: string;
  label: string;
  description: string;
  input: S;
  personas: Persona[];
  allowed?: (ctx: GymContext) => boolean;
  run: (ctx: GymContext, input: z.output<S>) => Promise<ToolOutcome>;
}): AnyTool {
  return { allowed: () => true, ...t } as AnyTool;
}

const money = (paise: number) => formatINR(paise);
const standingLabel = (s: string) => STANDING_LABELS[s as MemberStanding] ?? s;
const anyOf = (...perms: Parameters<typeof hasPermission>[1][]) => (ctx: GymContext) => perms.some((p) => hasPermission(ctx, p));
const self = (ctx: GymContext) => {
  if (!ctx.memberId) throw badRequest("This is only available to members.");
  return ctx.memberId;
};

/* ------------------------------------------------------------ everyone */

const gymInfo = tool({
  name: "get_gym_info",
  label: "Looking up gym details",
  description:
    "The gym's name, contact phone and email, address, opening hours, morning/evening batch hours, its equipment list with how many of each, and its trainers with their specialisations. Use for questions about timings, batches, location, contact, equipment or trainers.",
  input: z.object({}),
  personas: ["member", "staff"],
  run: (ctx) =>
    inGym(ctx, async (tx) => {
      const gym = await getGymProfile(tx, ctx);
      const trainers = await listTrainers(tx, ctx);
      const equipment = await listEquipment(tx, ctx);
      const batches = batchHoursOf(gym.settings);
      return {
        data: {
          name: gym.name,
          phone: gym.phone,
          email: gym.email,
          address: [gym.addressLine, gym.city, gym.state, gym.pincode].filter(Boolean).join(", ") || null,
          openingHours: gym.settings.openingHours ?? "Not set by the gym",
          batches: { morning: batchHoursLabel("morning", batches), evening: batchHoursLabel("evening", batches), rule: gym.settings.batchPolicy ?? "warn" },
          equipment: equipment.items.length
            ? equipment.items.map((i) => ({ name: i.name, quantity: i.quantity, area: i.group }))
            : `No equipment list yet. Exercise types the gym has: ${(gym.settings.availableEquipment ?? []).join(", ") || "not set"}`,
          trainers: trainers.map((t) => ({ name: t.fullName, specialisations: t.specializations })),
        },
      };
    }),
});

const crowd = tool({
  name: "get_gym_crowd",
  label: "Checking how busy the gym is",
  description:
    "How many people are in the gym right now (from check-ins and check-outs), how full that is, and the usual number of check-ins per hour on this weekday, with the busiest and a quieter hour later today. Counts only, never names. Use for 'is the gym busy?', 'when is it quiet?' and 'best time to come'.",
  input: z.object({}),
  personas: ["member", "staff"],
  run: (ctx) =>
    inGym(ctx, async (tx) => {
      const c = await gymCrowd(tx, ctx);
      const hour = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? "am" : "pm"}`;
      return {
        data: {
          insideNow: c.inside,
          comfortableCapacity: c.capacity,
          level: CROWD_LABELS[c.level],
          hourNow: hour(c.hourNow),
          usualCheckInsByHour: c.byHour.filter((h) => h.typical > 0).map((h) => ({ hour: hour(h.hour), usual: h.typical, today: h.today })),
          busiestHours: c.busiestHours.map(hour),
          quieterLaterToday: c.quietLater === null ? null : hour(c.quietLater),
        },
      };
    }),
});

const exercises = tool({
  name: "search_exercises",
  label: "Searching the exercise library",
  description:
    "Search the gym's exercise library by name, muscle or equipment. Returns step-by-step instructions. Use for 'how do I do X' and for alternatives when a machine is busy (search by the same muscle with different equipment).",
  input: z.object({
    query: z.string().max(60).optional().describe("Part of the exercise name, e.g. 'squat'"),
    muscle: z.string().max(30).optional().describe("Primary muscle, e.g. 'chest', 'quadriceps', 'lats'"),
    equipment: z.string().max(30).optional().describe("e.g. 'dumbbell', 'barbell', 'machine', 'cable', 'body only'"),
  }),
  personas: ["member", "staff"],
  allowed: (ctx) => Boolean(ctx.memberId) || hasPermission(ctx, "workouts.manage"),
  run: (ctx, input) =>
    inGym(ctx, async (tx) => {
      const found = await searchExercises(tx, ctx, exerciseQuery.parse({ q: input.query, muscle: input.muscle, equipment: input.equipment, pageSize: 6 }));
      return {
        data: {
          total: found.total,
          exercises: found.items.map((e) => ({
            name: e.name,
            equipment: e.equipment,
            level: e.level,
            muscles: e.primaryMuscles,
            instructions: e.instructions.slice(0, 6),
          })),
        },
      };
    }),
});

/* -------------------------------------------------------------- members */

const myMembership = tool({
  name: "get_my_membership",
  label: "Checking your membership",
  description: "The member's current plan, status, expiry date, days left, amount due and membership history.",
  input: z.object({}),
  personas: ["member"],
  run: (ctx) =>
    inGym(ctx, async (tx) => {
      const id = self(ctx);
      const member = await getMember(tx, ctx, id);
      const memberships = await listMemberMemberships(tx, ctx, id);
      const today = gymToday(ctx);
      const due = memberships.reduce((s, m) => s + m.outstandingPaise, 0);
      return {
        data: {
          status: standingLabel(member.standing),
          currentPlan: member.current?.planName ?? null,
          validUntil: member.current ? formatDate(member.current.validUntil) : null,
          daysLeft: member.current ? diffDays(today, member.current.validUntil) : null,
          amountDue: due > 0 ? money(due) : "Nothing due",
          trainer: member.trainerName,
          history: memberships.slice(0, 5).map((m) => ({
            plan: m.planName,
            from: formatDate(m.startDate),
            to: formatDate(m.endDate),
            phase: m.phase,
            total: money(m.totalPaise),
            due: m.outstandingPaise > 0 ? money(m.outstandingPaise) : null,
          })),
        },
      };
    }),
});

const myPlan = tool({
  name: "get_my_workout_plan",
  label: "Opening your workout plan",
  description:
    "The member's current trainer-approved workout plan: each day's exercises with sets, reps, rest and coaching notes, plus which day is suggested today.",
  input: z.object({}),
  personas: ["member"],
  run: (ctx) =>
    inGym(ctx, async (tx) => {
      const id = self(ctx);
      const plan = await activePlanFor(tx, ctx, id);
      if (!plan) return { data: { plan: null, note: "No approved plan yet. Their trainer creates and approves plans." } };
      const { logs } = await listWorkoutLogs(tx, ctx, id, 10);
      const today = gymToday(ctx);
      const suggested = suggestDay(plan.content.days, today, logs, plan.plan.id);
      return {
        data: {
          name: plan.plan.name,
          goal: plan.plan.goal ? (GOAL_LABELS[plan.plan.goal as FitnessGoal] ?? plan.plan.goal) : null,
          approvedBy: plan.approvedBy,
          suggestedToday: suggested?.title ?? null,
          warmup: plan.content.warmup,
          cooldown: plan.content.cooldown,
          trainerNotes: plan.content.notes,
          days: plan.content.days.map((d) => ({
            title: d.title,
            focus: d.focus,
            exercises: d.exercises.map((e) => ({
              name: plan.exercises[e.exerciseId]?.name ?? e.exerciseId,
              equipment: plan.exercises[e.exerciseId]?.equipment ?? null,
              sets: e.sets,
              reps: e.reps,
              restSeconds: e.restSeconds,
              note: e.notes || null,
            })),
          })),
        },
      };
    }),
});

const myHistory = tool({
  name: "get_my_workout_history",
  label: "Reading your workout log",
  description: "Workouts the member logged recently: date, day, exercises completed, effort and notes.",
  input: z.object({}),
  personas: ["member"],
  run: (ctx) =>
    inGym(ctx, async (tx) => {
      const { logs, last7Days } = await listWorkoutLogs(tx, ctx, self(ctx), 15);
      return {
        data: {
          workoutsLast7Days: last7Days,
          recent: logs.map((l) => ({ date: formatDate(l.performedOn), plan: l.planName, done: `${l.completedExercises}/${l.totalExercises}`, effort: l.difficulty, notes: l.notes })),
        },
      };
    }),
});

const myProgress = tool({
  name: "get_my_progress",
  label: "Checking your progress",
  description: "The member's recorded weight, body fat and body measurements over the last year, oldest first.",
  input: z.object({}),
  personas: ["member"],
  run: (ctx) =>
    inGym(ctx, async (tx) => {
      const entries = await listProgress(tx, ctx, self(ctx));
      return {
        data: entries.slice(-20).map((e) => ({ date: formatDate(e.recordedOn), weightKg: e.weightKg, bodyFatPct: e.bodyFatPct, ...e.measurements })),
      };
    }),
});

const myAttendance = tool({
  name: "get_my_attendance",
  label: "Checking your visits",
  description: "The member's gym visits: current streak, visits this month and in the last 30 days, and recent visit dates.",
  input: z.object({}),
  personas: ["member"],
  run: (ctx) =>
    inGym(ctx, async (tx) => {
      const a = await memberAttendance(tx, ctx, self(ctx), 15);
      return {
        data: { streakDays: a.streak, thisMonth: a.thisMonth, last30Days: a.last30, total: a.total, lastVisit: a.lastVisit ? formatDate(a.lastVisit) : null, recent: a.visits.map((v) => formatDate(v.date)) },
      };
    }),
});

const progressInput = z.object({
  memberId: z.string().uuid().optional().describe("Staff only: the member's id from find_members. Members leave this out."),
  weightKg: z.number().min(20).max(300).optional(),
  bodyFatPct: z.number().min(2).max(70).optional(),
  waistCm: z.number().min(30).max(250).optional(),
  chestCm: z.number().min(30).max(250).optional(),
  hipsCm: z.number().min(30).max(250).optional(),
  armCm: z.number().min(10).max(100).optional(),
  thighCm: z.number().min(20).max(150).optional(),
  recordedOn: z.string().optional().describe("YYYY-MM-DD; defaults to today"),
  notes: z.string().max(300).optional(),
});

const proposeProgress = tool({
  name: "propose_progress_entry",
  label: "Preparing a measurement to save",
  description:
    "Propose saving a weight/body measurement. This does NOT save anything: the person sees a card and must tap Confirm. Use only when they clearly ask to record a value.",
  input: progressInput,
  personas: ["member", "staff"],
  allowed: (ctx) => Boolean(ctx.memberId && ctx.role === "member") || hasPermission(ctx, "workouts.manage"),
  run: (ctx, input) =>
    inGym(ctx, async (tx) => {
      const memberId = ctx.role === "member" ? self(ctx) : input.memberId;
      if (!memberId) throw badRequest("Say which member this is for (use find_members first).");
      const member = await getMember(tx, ctx, memberId);
      assertCanCoach(ctx, member);
      const entry = {
        recordedOn: input.recordedOn && isISODate(input.recordedOn) ? input.recordedOn : null,
        weightKg: input.weightKg ?? null,
        bodyFatPct: input.bodyFatPct ?? null,
        waistCm: input.waistCm ?? null,
        chestCm: input.chestCm ?? null,
        hipsCm: input.hipsCm ?? null,
        armCm: input.armCm ?? null,
        thighCm: input.thighCm ?? null,
        notes: input.notes ?? null,
      };
      const parsed = progressEntrySchema.safeParse(entry);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid measurement.");
      const parts = [
        entry.weightKg !== null && `weight ${entry.weightKg} kg`,
        entry.bodyFatPct !== null && `body fat ${entry.bodyFatPct}%`,
        entry.waistCm !== null && `waist ${entry.waistCm} cm`,
        entry.chestCm !== null && `chest ${entry.chestCm} cm`,
        entry.hipsCm !== null && `hips ${entry.hipsCm} cm`,
        entry.armCm !== null && `upper arm ${entry.armCm} cm`,
        entry.thighCm !== null && `thigh ${entry.thighCm} cm`,
      ].filter(Boolean);
      const who = ctx.memberId === memberId ? "" : ` for ${member.fullName}`;
      const when = entry.recordedOn ? formatDate(entry.recordedOn) : "today";
      return { proposal: { type: "progress_entry", payload: { memberId, entry }, summary: `Save ${parts.join(", ")}${who} (${when})` } };
    }),
});

/* ---------------------------------------------------------------- staff */

const todayOverview = tool({
  name: "get_today_overview",
  label: "Checking today at the gym",
  description:
    "Today's check-ins, people likely inside now (current occupancy), yesterday and the 7-day average; plus today's collections and member counts when the person may see them.",
  input: z.object({}),
  personas: ["staff"],
  allowed: anyOf("attendance.view", "attendance.record", "payments.view", "members.view_all"),
  run: (ctx) =>
    inGym(ctx, async (tx) => {
      const out: Record<string, unknown> = { date: formatDate(gymToday(ctx)) };
      if (anyOf("attendance.view", "attendance.record")(ctx)) {
        const a = await attendanceSummary(tx, ctx);
        out.attendance = { checkInsToday: a.today, likelyInsideNow: a.insideNow, yesterday: a.yesterday, dailyAverageLast7Days: a.avg7 };
      }
      if (hasPermission(ctx, "payments.view")) {
        const p = await paymentSummary(tx, ctx);
        out.money = { collectedToday: money(p.today), paymentsToday: p.todayCount, collectedThisMonth: money(p.month), outstandingDues: money(p.outstanding), membersWithDues: p.membersWithDues };
      }
      return { data: out };
    }),
});

const PERIODS = ["today", "yesterday", "this_week", "this_month", "last_month", "custom"] as const;
const revenue = tool({
  name: "get_revenue",
  label: "Adding up collections",
  description: "Net collections (payments minus refunds) for a period, with a per-day breakdown. Periods: today, yesterday, this_week, this_month, last_month, or custom with from/to dates.",
  input: z.object({
    period: z.enum(PERIODS),
    from: z.string().optional().describe("YYYY-MM-DD, for custom"),
    to: z.string().optional().describe("YYYY-MM-DD, for custom"),
  }),
  personas: ["staff"],
  allowed: anyOf("payments.view"),
  run: (ctx, input) =>
    inGym(ctx, async (tx) => {
      const today = gymToday(ctx);
      const monthStart = `${today.slice(0, 8)}01` as ISODate;
      const lastMonthEnd = addDays(monthStart, -1);
      const ranges: Record<(typeof PERIODS)[number], [ISODate, ISODate]> = {
        today: [today, today],
        yesterday: [addDays(today, -1), addDays(today, -1)],
        this_week: [addDays(today, -6), today],
        this_month: [monthStart, today],
        last_month: [`${lastMonthEnd.slice(0, 8)}01`, lastMonthEnd],
        custom: [input.from && isISODate(input.from) ? input.from : monthStart, input.to && isISODate(input.to) ? input.to : today],
      };
      const [from, to] = ranges[input.period];
      if (diffDays(from, to) > 400) throw badRequest("Choose a range of a year or less.");
      const days = await dailyCollections(tx, ctx, from, to);
      const total = days.reduce((s, d) => s + d.net, 0);
      return {
        data: {
          from: formatDate(from),
          to: formatDate(to),
          total: money(total),
          byDay: days.filter((d) => d.net !== 0).slice(-31).map((d) => ({ date: formatDate(d.day), net: money(d.net) })),
        },
      };
    }),
});

const expiring = tool({
  name: "list_expiring_memberships",
  label: "Finding memberships to renew",
  description: "Members whose membership is expiring soon, plus those that expired in the last 14 days (renewal follow-ups).",
  input: z.object({}),
  personas: ["staff"],
  allowed: anyOf("members.view_all", "workouts.manage"),
  run: (ctx) =>
    inGym(ctx, async (tx) => {
      const today = gymToday(ctx);
      const soon = await listMembers(tx, ctx, memberListQuery.parse({ status: "expiring", pageSize: 50 }));
      const expired = await listMembers(tx, ctx, memberListQuery.parse({ status: "expired", pageSize: 100 }));
      const row = (m: (typeof soon.items)[number]) => ({
        id: m.id,
        name: m.fullName,
        code: m.memberCode,
        plan: m.planName,
        validUntil: m.validUntil ? formatDate(m.validUntil) : null,
        days: m.validUntil ? diffDays(today, m.validUntil) : null,
      });
      return {
        data: {
          expiringWithinDays: soonDays(ctx),
          expiringSoon: soon.items.map(row),
          expiredLast14Days: expired.items.filter((m) => m.validUntil && m.validUntil >= addDays(today, -14)).map(row),
        },
      };
    }),
});

const pendingPayments = tool({
  name: "list_pending_payments",
  label: "Checking pending payments",
  description: "Members with unpaid balances on their memberships, largest first, with the total outstanding.",
  input: z.object({}),
  personas: ["staff"],
  allowed: anyOf("payments.view"),
  run: (ctx) =>
    inGym(ctx, async (tx) => {
      const dues = await listDues(tx, ctx);
      return {
        data: {
          total: money(dues.reduce((s, d) => s + d.duePaise, 0)),
          members: dues.length,
          top: dues.slice(0, 25).map((d) => ({ id: d.memberId, name: d.fullName, code: d.memberCode, due: money(d.duePaise), since: formatDate(d.oldest) })),
        },
      };
    }),
});

const inactive = tool({
  name: "list_inactive_members",
  label: "Finding members who stopped coming",
  description: "Members with a valid membership who haven't checked in for a number of days (default 14). Good for retention follow-ups.",
  input: z.object({ days: z.number().int().min(3).max(120).default(14) }),
  personas: ["staff"],
  allowed: anyOf("members.view_all", "workouts.manage"),
  run: (ctx, input) =>
    inGym(ctx, async (tx) => {
      const today = gymToday(ctx);
      const since = addDays(today, -input.days);
      const standing = standingExpr(today, soonDays(ctx));
      const rows = (
        await tx.execute(sql`
          select m.id, m.full_name, m.member_code, cm.plan_name, cm.valid_until,
            (select max(a.check_in_date) from attendance a where a.member_id = m.id) as last_visit
          from members m ${currentMembershipJoin(today)}
          where m.gym_id = ${ctx.gym.id} and ${visibilityFilter(ctx)} and ${standing} in ('active', 'expiring')
            and not exists (select 1 from attendance a where a.member_id = m.id and a.check_in_date > ${since}::date)
          order by last_visit asc nulls first
          limit 50`)
      ).rows as { id: string; full_name: string; member_code: string; plan_name: string | null; valid_until: string | null; last_visit: string | null }[];
      return {
        data: {
          noVisitForDays: input.days,
          count: rows.length,
          members: rows.map((r) => ({ id: r.id, name: r.full_name, code: r.member_code, plan: r.plan_name, lastVisit: r.last_visit ? formatDate(String(r.last_visit)) : "Never" })),
        },
      };
    }),
});

const approvals = tool({
  name: "list_pending_approvals",
  label: "Checking plans waiting for approval",
  description: "Workout plans waiting for a trainer's review and approval (members can't see them until approved).",
  input: z.object({}),
  personas: ["staff"],
  allowed: anyOf("workouts.manage"),
  run: (ctx) =>
    inGym(ctx, async (tx) => {
      const plans = await listPlans(tx, ctx, { status: "pending_review" });
      return {
        data: {
          count: plans.length,
          canApprove: hasPermission(ctx, "workouts.approve"),
          plans: plans.slice(0, 30).map((p) => ({ id: p.id, plan: p.name, member: p.memberName, trainer: p.trainerName, source: p.source, updated: formatDate(p.updatedAt.toISOString().slice(0, 10)) })),
        },
      };
    }),
});

const trainers = tool({
  name: "get_trainers",
  label: "Checking the trainers",
  description:
    "Active trainers with their specialisations and how many members are assigned to each. FITO does not track shifts, so true availability by time is unknown.",
  input: z.object({}),
  personas: ["staff"],
  allowed: anyOf("members.view_all", "staff.manage"),
  run: (ctx) =>
    inGym(ctx, async (tx) => {
      const staff = await listStaff(tx, ctx);
      return {
        data: staff
          .filter((s) => s.role === "trainer" && s.status === "active")
          .map((s) => ({ name: s.fullName, specialisations: s.specializations, assignedMembers: s.assignedMembers, hasAppAccount: Boolean(s.userId) })),
      };
    }),
});

const findMembers = tool({
  name: "find_members",
  label: "Searching members",
  description: "Search members by name, phone or member code. Returns ids for get_member_details.",
  input: z.object({ query: z.string().min(1).max(60) }),
  personas: ["staff"],
  allowed: anyOf("members.view_all", "workouts.manage"),
  run: (ctx, input) =>
    inGym(ctx, async (tx) => {
      const found = await listMembers(tx, ctx, memberListQuery.parse({ q: input.query, pageSize: 10 }));
      return {
        data: found.items.map((m) => ({ id: m.id, name: m.fullName, code: m.memberCode, status: standingLabel(m.standing), plan: m.planName, validUntil: m.validUntil ? formatDate(m.validUntil) : null, trainer: m.trainerName })),
      };
    }),
});

const memberDetails = tool({
  name: "get_member_details",
  label: "Opening the member's record",
  description: "One member's status, membership, amount due (if allowed), visits, trainer and workout plan status. Needs the id from find_members.",
  input: z.object({ memberId: z.string().uuid() }),
  personas: ["staff"],
  allowed: anyOf("members.view_all", "workouts.manage"),
  run: (ctx, input) =>
    inGym(ctx, async (tx) => {
      const m = await getMember(tx, ctx, input.memberId);
      const visits = await memberAttendance(tx, ctx, m.id, 5).catch(() => null);
      const due = hasPermission(ctx, "payments.view") ? await duesForMember(tx, ctx, m.id) : null;
      const plan = hasPermission(ctx, "workouts.manage") ? await activePlanFor(tx, ctx, m.id).catch(() => null) : null;
      return {
        data: {
          name: m.fullName,
          code: m.memberCode,
          status: standingLabel(m.standing),
          plan: m.current?.planName ?? null,
          validUntil: m.current ? formatDate(m.current.validUntil) : null,
          amountDue: due === null ? "Not visible to you" : due > 0 ? money(due) : "Nothing due",
          trainer: m.trainerName,
          lastVisit: visits?.lastVisit ? formatDate(visits.lastVisit) : null,
          visitsThisMonth: visits?.thisMonth ?? null,
          goal: m.fitness.fitnessGoal ? (GOAL_LABELS[m.fitness.fitnessGoal as FitnessGoal] ?? m.fitness.fitnessGoal) : null,
          activeWorkoutPlan: plan ? plan.plan.name : null,
          medicalClearancePending: m.fitness.medicalClearanceRequired,
        },
      };
    }),
});

export const TOOLS: AnyTool[] = [
  gymInfo,
  crowd,
  exercises,
  myMembership,
  myPlan,
  myHistory,
  myProgress,
  myAttendance,
  todayOverview,
  revenue,
  expiring,
  pendingPayments,
  inactive,
  approvals,
  trainers,
  findMembers,
  memberDetails,
  proposeProgress,
];

/** Tools this person may use, in a fixed order (keeps the prompt prefix stable). */
export function toolsFor(ctx: GymContext): AnyTool[] {
  const persona = personaFor(ctx);
  return TOOLS.filter((t) => t.personas.includes(persona) && t.allowed(ctx));
}

/** API definitions for the model (JSON Schema from the Zod input). */
export function toolDefinitions(tools: AnyTool[]): Anthropic.Beta.BetaTool[] {
  return tools.map((t) => {
    const { $schema: _s, ...schema } = z.toJSONSchema(t.input, { io: "input" }) as Record<string, unknown>;
    return {
      name: t.name,
      description: t.description,
      input_schema: { ...schema, type: "object" } as Anthropic.Beta.BetaTool.InputSchema,
      // Inputs stream as generated; every input is validated with Zod before running.
      eager_input_streaming: true,
    };
  });
}

export function findTool(tools: AnyTool[], name: string): AnyTool | undefined {
  return tools.find((t) => t.name === name);
}
