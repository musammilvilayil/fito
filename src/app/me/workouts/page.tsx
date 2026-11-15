import { Dumbbell } from "lucide-react";
import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { formatDate } from "@/shared/dates";
import { GOAL_LABELS, type FitnessGoal } from "@/shared/schemas/workout";
import { suggestDay } from "@/shared/workout-schedule";
import { sequential } from "@/server/db/tx";
import { inGym } from "@/server/auth/context";
import { requireMemberContext } from "@/server/auth/page";
import { gymToday } from "@/server/modules/members/service";
import { activePlanFor } from "@/server/modules/workouts/service";
import { listWorkoutLogs } from "@/server/modules/workouts/tracking";
import { WorkoutDay } from "./workout-day";

export const metadata: Metadata = { title: "Workout" };

export default async function MemberWorkoutsPage({ searchParams }: PageProps<"/me/workouts">) {
  const ctx = await requireMemberContext();
  const sp = await searchParams;
  const [plan, history] = await inGym(ctx, (tx) =>
    sequential(
      () => activePlanFor(tx, ctx, ctx.memberId),
      () => listWorkoutLogs(tx, ctx, ctx.memberId, 20),
    ),
  );
  if (!plan) {
    return (
      <Card>
        <EmptyState icon={Dumbbell} title="No workout plan yet" description="Your trainer will share a plan here once it's ready. Ask at the front desk if you'd like one." />
      </Card>
    );
  }

  const today = gymToday(ctx);
  const days = plan.content.days;
  const requested = typeof sp.day === "string" ? days.find((d) => d.key === sp.day) : undefined;
  const day = requested ?? suggestDay(days, today, history.logs, plan.plan.id)!;
  const todaysLog = history.logs.find((l) => l.planId === plan.plan.id && l.dayKey === day.key && l.performedOn === today) ?? null;
  const dayTitle = (key: string) => days.find((d) => d.key === key)?.title ?? key;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">{plan.plan.name}</h1>
        <p className="text-sm text-ink-muted">
          {plan.plan.goal ? (GOAL_LABELS[plan.plan.goal as FitnessGoal] ?? plan.plan.goal) : "Workout plan"}
          {plan.approvedBy ? ` · from ${plan.approvedBy}` : ""}
        </p>
      </div>

      <WorkoutDay
        key={`${day.key}-${todaysLog?.id ?? "new"}`}
        memberId={ctx.memberId}
        planId={plan.plan.id}
        days={days.map((d) => ({ key: d.key, title: d.title, weekday: d.weekday ?? null }))}
        day={day}
        exercises={plan.exercises}
        warmup={plan.content.warmup}
        cooldown={plan.content.cooldown}
        notes={plan.content.notes}
        existing={todaysLog ? { entries: todaysLog.entries, difficulty: todaysLog.difficulty, notes: todaysLog.notes } : null}
      />

      <Card>
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold">History</h2>
          <p className="text-[13px] text-ink-muted">{history.last7Days} workout{history.last7Days === 1 ? "" : "s"} in the last 7 days</p>
        </div>
        {history.logs.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ink-muted">Nothing logged yet. Tick off exercises above and save when you finish.</p>
        ) : (
          <ul className="divide-y divide-line">
            {history.logs.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{l.planId === plan.plan.id ? dayTitle(l.dayKey) : l.planName}</span>
                  <span className="block text-[12.5px] text-ink-subtle">{l.performedOn === today ? "Today" : formatDate(l.performedOn)}</span>
                </span>
                <span className="tabular shrink-0 text-ink-muted">
                  {l.completedExercises}/{l.totalExercises} done
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
