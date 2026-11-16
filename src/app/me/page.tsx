import { ChevronRight, Dumbbell, IndianRupee, ScanLine, Scale, Sparkles, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CrowdCard } from "@/components/member/crowd-card";
import { ProgressRing, WeekBars, type DayBar } from "@/components/member/week-widgets";
import { StandingBadge } from "@/components/members/standing-badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { addDays, diffDays, formatDate, formatTime } from "@/shared/dates";
import { BATCH_LABELS, batchHoursLabel } from "@/shared/batches";
import { CAN_CHECK_IN } from "@/shared/membership";
import { formatINR } from "@/shared/money";
import { GOAL_LABELS, LEVEL_LABELS, WEEKDAYS, type ExperienceLevel, type FitnessGoal } from "@/shared/schemas/workout";
import { estimateDayMinutes } from "@/shared/workout-rules";
import { isForToday, suggestDay, weekdayIndex } from "@/shared/workout-schedule";
import { inGym } from "@/server/auth/context";
import { requireMemberContext } from "@/server/auth/page";
import { assistantAvailability } from "@/server/modules/assistant/service";
import { gymCrowd } from "@/server/modules/attendance/crowd";
import { sequential } from "@/server/db/tx";
import { gymToday } from "@/server/modules/members/service";
import { memberHome } from "@/server/modules/portal/service";
import { CheckInQr } from "./check-in-qr";
import { Updates } from "./updates";

export const metadata: Metadata = { title: "Home" };

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

export default async function MemberHomePage() {
  const ctx = await requireMemberContext();
  const [home, crowd] = await inGym(ctx, (tx) => sequential(() => memberHome(tx, ctx), () => gymCrowd(tx, ctx)));
  const today = gymToday(ctx);
  const { member, attendance, plan, logs } = home;
  const current = member.current;
  const daysLeft = current ? diffDays(today, current.validUntil) : null;
  const day = plan ? suggestDay(plan.content.days, today, logs.logs, plan.id) : null;
  const doneToday = day && logs.logs.some((l) => l.planId === plan?.id && l.dayKey === day.key && l.performedOn === today);
  const firstName = member.fullName.split(" ")[0];
  const canCheckIn = CAN_CHECK_IN.has(member.standing);
  const askAvailable = assistantAvailability(ctx).available;

  // This week, Monday to Sunday.
  const weekStart = addDays(today, -weekdayIndex(today));
  const week: DayBar[] = DAY_LETTERS.map((label, i) => {
    const date = addDays(weekStart, i);
    const v = attendance.visits.find((x) => x.date === date);
    const known = v?.checkOutAt ? Math.round((new Date(v.checkOutAt).getTime() - new Date(v.checkInAt).getTime()) / 60_000) : null;
    return { label, date, minutes: v ? (known ?? 60) : 0, estimated: Boolean(v && known === null), isToday: date === today };
  });
  const workoutsThisWeek = logs.logs.filter((l) => l.performedOn >= weekStart && l.completedExercises > 0).length;
  const goal = member.fitness.trainingDaysPerWeek ?? plan?.content.days.length ?? 3;
  const visitsThisWeek = week.filter((d) => d.minutes > 0).length;
  const minutesThisWeek = week.reduce((s, d) => s + d.minutes, 0);
  const heroImage = day && plan ? day.exercises.map((e) => plan.exercises[e.exerciseId]?.images[0]).find(Boolean) : undefined;

  const actions = [
    { href: day ? `/me/workouts?day=${encodeURIComponent(day.key)}` : "/me/workouts", label: "Start workout", icon: Dumbbell, tone: "bg-lime-soft text-lime" },
    { href: "/me/progress?add=1", label: "Log weight", icon: Scale, tone: "bg-coral-soft text-[#c94f33]" },
    { href: "/me/scan", label: "Scan gym QR", icon: ScanLine, tone: "bg-[#fdf1d8] text-[#a14a06]" },
    askAvailable
      ? { href: "/me/assistant", label: "Ask FITO", icon: Sparkles, tone: "bg-[#ece6fb] text-[#5b3fb8]" }
      : { href: "/me/profile", label: "My profile", icon: UserRound, tone: "bg-[#ece6fb] text-[#5b3fb8]" },
  ];

  return (
    <div className="space-y-4">
      <div className="px-1">
        <h1 className="text-[24px] font-semibold tracking-tight">Hi, {firstName} 👋</h1>
        <p className="text-sm text-ink-muted">{doneToday ? "Great work today. Rest well!" : "Ready to crush your goals?"}</p>
      </div>

      <CrowdCard initial={crowd} timezone={ctx.gym.timezone} batch={member.batch === "any" ? null : `${BATCH_LABELS[member.batch]} · ${batchHoursLabel(member.batch, crowd.batches)}`} />

      <Card>
        <CardBody className="flex items-center gap-5">
          <ProgressRing value={goal ? workoutsThisWeek / goal : 0} />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold">This week</div>
            <dl className="mt-2 space-y-1.5 text-[13px]">
              <Row dot="bg-mint" label="Workouts" value={`${workoutsThisWeek} / ${goal}`} />
              <Row dot="bg-coral" label="Gym visits" value={String(visitsThisWeek)} />
              <Row dot="bg-[#f2b84b]" label="Time in gym" value={minutesThisWeek ? `${Math.floor(minutesThisWeek / 60)}h ${minutesThisWeek % 60}m` : "—"} />
              <Row dot="bg-[#8b74e0]" label="Day streak" value={String(attendance.streak)} />
            </dl>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold">Weekly activity</h2>
            <span className="text-[12px] text-ink-subtle">minutes at the gym</span>
          </div>
          <WeekBars days={week} />
        </CardBody>
      </Card>

      <section aria-labelledby="quick-actions">
        <h2 id="quick-actions" className="mb-2 px-1 text-[15px] font-semibold">
          Quick actions
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {actions.map((a) => (
            <Link key={a.label} href={a.href} className="glass flex items-center gap-3 rounded-2xl border p-3.5 transition-transform active:scale-[0.98]">
              <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", a.tone)}>
                <a.icon className="size-5" />
              </span>
              <span className="min-w-0 text-[14px] font-medium leading-tight">{a.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {plan && day ? (
        <Link
          href={`/me/workouts?day=${encodeURIComponent(day.key)}`}
          className="relative block overflow-hidden rounded-[var(--radius-card)] bg-[linear-gradient(120deg,#f6e7dc,#e5f2ec)] p-5 shadow-[0_10px_30px_-14px_rgb(29_70_60/0.3)]"
        >
          {heroImage && (
            // eslint-disable-next-line @next/next/no-img-element -- public-domain exercise photo
            <img src={heroImage} alt="" className="absolute inset-y-0 right-0 h-full w-[46%] object-cover [mask-image:linear-gradient(to_right,transparent,black_45%)]" />
          )}
          <div className="relative max-w-[58%]">
            <div className="text-[12px] font-medium uppercase tracking-wide text-lime">
              {doneToday ? "Done today" : day.weekday !== null && day.weekday !== undefined && !isForToday(day, today) ? `Next · ${WEEKDAYS[day.weekday]}` : "Today's workout"}
            </div>
            <div className="mt-1 text-[20px] font-semibold leading-tight">{day.title}</div>
            <div className="tabular mt-1 text-[13px] text-ink-muted">
              {estimateDayMinutes(day)} min · {day.exercises.length} exercises
              {member.fitness.experienceLevel ? ` · ${LEVEL_LABELS[member.fitness.experienceLevel as ExperienceLevel] ?? ""}` : ""}
            </div>
            <span className="mt-4 inline-grid size-10 place-items-center rounded-full bg-white text-ink shadow-sm" aria-hidden>
              <ChevronRight className="size-5" />
            </span>
            <span className="sr-only">Open workout</span>
          </div>
        </Link>
      ) : (
        <Card>
          <EmptyState icon={Dumbbell} title="No workout plan yet" description="Your trainer will share a plan here once it's ready." />
        </Card>
      )}

      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12.5px] text-ink-subtle">Membership</div>
              <div className="truncate text-[17px] font-semibold">{current?.planName ?? "No active membership"}</div>
            </div>
            <StandingBadge standing={member.standing} />
          </div>
          {current ? (
            <>
              <p className="text-sm text-ink-muted">
                Valid until <span className="font-medium text-ink">{formatDate(current.validUntil)}</span>
                {daysLeft !== null && daysLeft >= 0 && <span className="tabular"> · {daysLeft === 0 ? "last day today" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}</span>}
              </p>
              {daysLeft !== null && daysLeft >= 0 && (
                <div className="h-2 overflow-hidden rounded-full bg-[#e1ece7]" aria-hidden>
                  <div
                    className={cn("h-full rounded-full", daysLeft <= 7 ? "bg-coral" : "bg-mint")}
                    style={{ width: `${Math.min(100, Math.max(4, (daysLeft / Math.max(1, diffDays(current.startDate, current.validUntil))) * 100))}%` }}
                  />
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-ink-muted">Visit the front desk to join or renew.</p>
          )}
          {home.outstandingPaise > 0 && (
            <p className="flex items-center gap-2 rounded-xl border border-warning/25 bg-[#fdf1d8] px-3 py-2 text-[13px]">
              <IndianRupee className="size-4 shrink-0 text-warning" />
              <span>
                <span className="tabular font-semibold">{formatINR(home.outstandingPaise)}</span> due. Please pay at the front desk.
              </span>
            </p>
          )}
        </CardBody>
      </Card>

      <CheckInQr memberId={member.id} memberCode={member.memberCode} memberName={member.fullName} canCheckIn={canCheckIn} />

      <Updates
        items={home.notifications.items.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, read: Boolean(n.readAt), at: n.createdAt.toISOString() }))}
        unread={home.notifications.unread}
        timezone={ctx.gym.timezone}
      />

      <Card>
        <CardHeader title="Recent visits" description={`${attendance.thisMonth} this month${plan?.goal ? ` · goal: ${GOAL_LABELS[plan.goal as FitnessGoal] ?? plan.goal}` : ""}`} />
        {attendance.visits.length === 0 ? (
          <CardBody className="text-sm text-ink-muted">No visits yet. Show your QR code at the front desk when you arrive.</CardBody>
        ) : (
          <ul className="divide-y divide-line">
            {attendance.visits.slice(0, 5).map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span>{v.date === today ? "Today" : formatDate(v.date)}</span>
                <span className="tabular text-ink-muted">
                  {formatTime(v.checkInAt, ctx.gym.timezone)}
                  {v.checkOutAt ? ` – ${formatTime(v.checkOutAt, ctx.gym.timezone)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Row({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("size-2 shrink-0 rounded-full", dot)} aria-hidden />
      <dt className="flex-1 text-ink-muted">{label}</dt>
      <dd className="tabular font-semibold">{value}</dd>
    </div>
  );
}
