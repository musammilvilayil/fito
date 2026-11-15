import { CalendarCheck, ChevronRight, Dumbbell, Flame, IndianRupee, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StandingBadge } from "@/components/members/standing-badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { CAN_CHECK_IN } from "@/shared/membership";
import { diffDays, formatDate, formatTime } from "@/shared/dates";
import { formatINR } from "@/shared/money";
import { GOAL_LABELS, WEEKDAYS, type FitnessGoal } from "@/shared/schemas/workout";
import { isForToday, suggestDay } from "@/shared/workout-schedule";
import { estimateDayMinutes } from "@/shared/workout-rules";
import { inGym } from "@/server/auth/context";
import { requireMemberContext } from "@/server/auth/page";
import { gymToday } from "@/server/modules/members/service";
import { memberHome } from "@/server/modules/portal/service";
import { CheckInQr } from "./check-in-qr";
import { Updates } from "./updates";

export const metadata: Metadata = { title: "Home" };

export default async function MemberHomePage() {
  const ctx = await requireMemberContext();
  const home = await inGym(ctx, (tx) => memberHome(tx, ctx));
  const today = gymToday(ctx);
  const { member, attendance, plan, logs } = home;
  const current = member.current;
  const daysLeft = current ? diffDays(today, current.validUntil) : null;
  const day = plan ? suggestDay(plan.content.days, today, logs.logs, plan.id) : null;
  const doneToday = day && logs.logs.some((l) => l.planId === plan?.id && l.dayKey === day.key && l.performedOn === today);
  const firstName = member.fullName.split(" ")[0];
  const canCheckIn = CAN_CHECK_IN.has(member.standing);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">Hi, {firstName}</h1>
        <p className="text-sm text-ink-muted">
          {member.memberCode}
          {member.trainerName ? ` · Trainer: ${member.trainerName}` : ""}
        </p>
      </div>

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
            <p className="text-sm text-ink-muted">
              Valid until <span className="font-medium text-ink">{formatDate(current.validUntil)}</span>
              {daysLeft !== null && daysLeft >= 0 && (
                <span className="tabular">
                  {" "}
                  · {daysLeft === 0 ? "last day today" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
                </span>
              )}
            </p>
          ) : (
            <p className="text-sm text-ink-muted">Visit the front desk to join or renew.</p>
          )}
          {home.outstandingPaise > 0 && (
            <p className="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-[13px]">
              <IndianRupee className="size-4 shrink-0 text-warning" />
              <span>
                <span className="tabular font-semibold">{formatINR(home.outstandingPaise)}</span> due. Please pay at the front desk.
              </span>
            </p>
          )}
        </CardBody>
      </Card>

      <CheckInQr memberId={member.id} memberCode={member.memberCode} memberName={member.fullName} canCheckIn={canCheckIn} />

      <div className="grid grid-cols-3 gap-3">
        <Stat icon={Flame} label="Day streak" value={attendance.streak} />
        <Stat icon={CalendarCheck} label="Visits this month" value={attendance.thisMonth} />
        <Stat icon={TrendingUp} label="Workouts, 7 days" value={logs.last7Days} />
      </div>

      <Card>
        <CardHeader
          title={doneToday ? "Done today" : day && !isForToday(day, today) ? "Next workout" : "Today's workout"}
          description={plan ? `${plan.name}${plan.goal ? ` · ${GOAL_LABELS[plan.goal as FitnessGoal] ?? plan.goal}` : ""}` : undefined}
        />
        {plan && day ? (
          <Link href={`/me/workouts?day=${encodeURIComponent(day.key)}`} className="flex items-center gap-3 px-5 py-4 hover:bg-raised/50">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lime-soft text-lime">
              <Dumbbell className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {day.weekday !== null && day.weekday !== undefined && <span className="mr-1.5 text-lime">{WEEKDAYS[day.weekday]}</span>}
                {day.title}
              </span>
              <span className="tabular block truncate text-[13px] text-ink-muted">
                {day.exercises.length} exercises · ~{estimateDayMinutes(day)} min{day.focus ? ` · ${day.focus}` : ""}
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-lime">
              {doneToday ? "View" : day && !isForToday(day, today) ? "Preview" : "Start"} <ChevronRight className="size-4" />
            </span>
          </Link>
        ) : (
          <EmptyState icon={Dumbbell} title="No workout plan yet" description="Your trainer will share a plan here once it's ready." />
        )}
      </Card>

      <Updates items={home.notifications.items.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, read: Boolean(n.readAt), at: n.createdAt.toISOString() }))} unread={home.notifications.unread} timezone={ctx.gym.timezone} />

      <Card>
        <CardHeader title="Recent visits" />
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

function Stat({ icon: Icon, label, value }: { icon: typeof Flame; label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-[var(--radius-card)] border border-line bg-surface p-3">
      <Icon className="size-4 text-lime" aria-hidden />
      <div className="tabular mt-2 text-[22px] font-semibold leading-none">{value}</div>
      <div className="mt-1 text-[11.5px] leading-tight text-ink-subtle">{label}</div>
    </div>
  );
}
