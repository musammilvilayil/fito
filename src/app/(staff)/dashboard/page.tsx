import { Activity, CalendarClock, CalendarDays, DoorOpen, IndianRupee, ScanLine, UserCheck, UserPlus, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { attendanceSummary } from "@/server/modules/attendance/service";
import type { Metadata } from "next";
import Link from "next/link";
import { StandingBadge } from "@/components/members/standing-badge";
import { renewalReminder, WhatsAppButton } from "@/components/members/whatsapp-button";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar, PageHeader, StatCard } from "@/components/ui/page";
import { EmptyState } from "@/components/ui/states";
import { formatDate } from "@/shared/dates";
import { formatINR } from "@/shared/money";
import { paymentSummary } from "@/server/modules/payments/service";
import { hasPermission, inGym } from "@/server/auth/context";
import { requireStaffContext } from "@/server/auth/page";
import { getSetupStatus } from "@/server/modules/gyms/setup";
import { getMemberOverview, type DashboardMember } from "@/server/modules/reports/dashboard";
import { SetupChecklist } from "./setup-checklist";
import { sequential } from "@/server/db/tx";

export const metadata: Metadata = { title: "Dashboard" };

function greeting(timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage() {
  const ctx = await requireStaffContext();
  const canSeeMembers = hasPermission(ctx, "members.view_all") || hasPermission(ctx, "workouts.manage");
  const canSeeMoney = hasPermission(ctx, "payments.view");
  const canSeeAttendance = hasPermission(ctx, "attendance.view") || hasPermission(ctx, "attendance.record");
  const [setup, overview, money, visits] = await inGym(ctx, (tx) =>
    sequential(
      () => getSetupStatus(tx, ctx),
      () => (canSeeMembers ? getMemberOverview(tx, ctx) : Promise.resolve(null)),
      () => (canSeeMoney ? paymentSummary(tx, ctx) : Promise.resolve(null)),
      () => (canSeeAttendance ? attendanceSummary(tx, ctx) : Promise.resolve(null)),
    ),
  );
  const firstName = ctx.user.fullName.split(" ")[0];
  const scopeLabel = hasPermission(ctx, "members.view_all") ? "" : " (your members)";

  return (
    <>
      <PageHeader eyebrow={ctx.gym.name} title={`${greeting(ctx.gym.timezone)}, ${firstName}`} description="Here's what needs your attention today." />
      <SetupChecklist status={setup} canManageGym={hasPermission(ctx, "gym.manage")} canManageStaff={hasPermission(ctx, "staff.manage")} />

      {visits && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          <StatCard label="Checked in today" value={visits.today} icon={Activity} tone="lime" hint={`${visits.yesterday} yesterday · avg ${visits.avg7}/day`} />
          <StatCard label="Probably inside now" value={visits.insideNow} icon={DoorOpen} hint="Checked in, not out yet" />
          {hasPermission(ctx, "attendance.record") && (
            <div className="col-span-2 flex items-center justify-center rounded-[var(--radius-card)] border border-dashed border-line-strong p-4 lg:col-span-1">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href="/attendance/scan">
                  <ScanLine /> Open check-in scanner
                </Link>
              </Button>
            </div>
          )}
        </div>
      )}

      {money && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          <StatCard label="Collected today" value={formatINR(money.today)} icon={IndianRupee} tone="lime" hint={`${money.todayCount} payment${money.todayCount === 1 ? "" : "s"}`} />
          <StatCard label="This month" value={formatINR(money.month)} icon={CalendarDays} hint="Net of refunds" />
          <Link href="/payments?view=dues" className="col-span-2 lg:col-span-1">
            <StatCard
              label="Outstanding dues"
              value={formatINR(money.outstanding)}
              icon={Wallet}
              tone={money.outstanding > 0 ? "warning" : "default"}
              hint={`${money.membersWithDues} member${money.membersWithDues === 1 ? "" : "s"} · view list`}
              className="h-full transition-colors hover:border-line-strong"
            />
          </Link>
        </div>
      )}

      {overview && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard label={`Active members${scopeLabel}`} value={overview.active} icon={UserCheck} tone="lime" hint={overview.expiring > 0 ? `Incl. ${overview.expiring} expiring soon · ${overview.total} on register` : `${overview.total} on register`} />
            <StatCard
              label="Expiring soon"
              value={overview.expiring}
              icon={CalendarClock}
              tone={overview.expiring > 0 ? "warning" : "default"}
              hint={`Within ${overview.soonDays} days`}
            />
            <StatCard label="Expired" value={overview.expired} icon={Users} tone={overview.expired > 0 ? "danger" : "default"} hint="Not renewed yet" />
            <StatCard label="New this month" value={overview.newThisMonth} icon={UserPlus} hint="Joined since the 1st" />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader
                title="Renewals to chase"
                description="Expiring soon or lapsed in the last 14 days"
                action={
                  <Link href="/members?status=expiring" className="text-[13px] font-medium text-lime hover:underline">
                    View all
                  </Link>
                }
              />
              {overview.expiringList.length === 0 ? (
                <EmptyState icon={CalendarClock} title="No renewals due" description="Members close to expiry will show up here." className="py-10" />
              ) : (
                <MemberList members={overview.expiringList} gymName={ctx.gym.name} showReminder />
              )}
            </Card>
            <Card>
              <CardHeader
                title="Recently added"
                action={
                  <Link href="/members" className="text-[13px] font-medium text-lime hover:underline">
                    All members
                  </Link>
                }
              />
              {overview.recentMembers.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="No members yet"
                  description="Add members or import your register to get started."
                  action={
                    hasPermission(ctx, "members.manage") && (
                      <Link href="/members/import" className="text-[13px] font-medium text-lime hover:underline">
                        Import from Excel
                      </Link>
                    )
                  }
                  className="py-10"
                />
              ) : (
                <MemberList members={overview.recentMembers} gymName={ctx.gym.name} />
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function MemberList({ members, gymName, showReminder }: { members: DashboardMember[]; gymName: string; showReminder?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {members.map((m) => (
        <li key={m.id} className="flex items-center gap-3 px-5 py-3">
          <Avatar name={m.fullName} size={34} />
          <Link href={`/members/${m.id}`} className="min-w-0 flex-1 hover:text-lime">
            <div className="truncate text-sm font-medium">{m.fullName}</div>
            <div className="truncate text-[12px] text-ink-subtle">
              {m.planName ? `${m.planName} · ` : ""}
              {m.validUntil ? `until ${formatDate(m.validUntil)}` : `joined ${formatDate(m.joinedOn)}`}
            </div>
          </Link>
          <StandingBadge standing={m.standing} />
          {showReminder && (
            <WhatsAppButton phone={m.phone} compact label={`Remind ${m.fullName}`} message={renewalReminder(m.fullName, gymName, m.validUntil)} />
          )}
        </li>
      ))}
    </ul>
  );
}
