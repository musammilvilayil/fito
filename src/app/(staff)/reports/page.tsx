import { Activity, IndianRupee, Repeat, UserCheck, UserPlus, UserX, Users, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { RangeFilter } from "@/components/range-filter";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader, StatCard } from "@/components/ui/page";
import { AccessDenied } from "@/components/ui/states";
import { addDays, addMonths, formatDate, isISODate } from "@/shared/dates";
import { formatINR } from "@/shared/money";
import { hasPermission, inGym } from "@/server/auth/context";
import { requireStaffContext } from "@/server/auth/page";
import { gymToday } from "@/server/modules/members/service";
import { getReport } from "@/server/modules/reports/service";
import { BusiestHours, DailyCheckIns, NewMembersByMonth, RevenueByMonth } from "./charts";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const ctx = await requireStaffContext();
  if (!hasPermission(ctx, "reports.view")) return <AccessDenied />;
  const sp = await searchParams;
  const today = gymToday(ctx);
  const from = typeof sp.from === "string" && isISODate(sp.from) ? sp.from : undefined;
  const to = typeof sp.to === "string" && isISODate(sp.to) ? sp.to : undefined;
  const r = await inGym(ctx, (tx) => getReport(tx, ctx, { from, to }));
  const monthStart = `${today.slice(0, 8)}01`;
  const presets = [
    { label: "Last 30 days", from: addDays(today, -29), to: today },
    { label: "This month", from: monthStart, to: today },
    { label: "Last 3 months", from: addMonths(addDays(today, 1), -3), to: today },
    { label: "Last 12 months", from: addMonths(addDays(today, 1), -12), to: today },
  ];
  const currentMonth = r.to.slice(0, 7);
  const rate = r.renewals.rate === null ? "—" : `${Math.round(r.renewals.rate * 100)}%`;

  return (
    <>
      <PageHeader title="Reports" description={`${formatDate(r.from)} – ${formatDate(r.to)}`} />
      <RangeFilter from={r.from} to={r.to} today={today} presets={presets} />

      <h2 className="mb-3 text-[12px] font-medium uppercase tracking-[0.1em] text-ink-subtle">Members today</h2>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Total members" value={r.members.total} icon={Users} />
        <StatCard label="Active memberships" value={r.members.active} icon={UserCheck} tone="lime" hint={`${r.members.expiring} expiring soon`} />
        <StatCard label="Expired" value={r.members.expired} icon={UserX} tone={r.members.expired ? "danger" : "default"} hint={`${r.members.noMembership} with no plan`} />
        <StatCard label="Outstanding dues" value={formatINR(r.revenue.outstanding)} icon={Wallet} tone={r.revenue.outstanding ? "warning" : "default"} hint={`${r.revenue.membersWithDues} members`} />
      </div>

      <h2 className="mb-3 text-[12px] font-medium uppercase tracking-[0.1em] text-ink-subtle">In this period</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Net revenue" value={formatINR(r.revenue.net)} icon={IndianRupee} tone="lime" hint={r.revenue.refunded ? `After ${formatINR(r.revenue.refunded)} refunds` : "Collected payments"} />
        <StatCard label="New registrations" value={r.members.newInRange} icon={UserPlus} hint="By joining date" />
        <StatCard
          label="Renewal rate"
          value={rate}
          icon={Repeat}
          hint={r.renewals.due ? `${r.renewals.renewed} of ${r.renewals.due} renewed within ${r.renewals.graceDays} days` : "No memberships ended in this period"}
        />
        <StatCard label="Check-ins" value={r.attendance.total} icon={Activity} hint={`${r.attendance.uniqueMembers} different members`} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Revenue by month" description="Last 12 months, net of refunds" />
          <CardBody>
            <RevenueByMonth data={r.monthly} current={currentMonth} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="New members by month" description="Last 12 months, by joining date" />
          <CardBody>
            <NewMembersByMonth data={r.monthly} current={currentMonth} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Daily check-ins" description="Selected period" />
          <CardBody>
            {r.attendance.daily ? (
              <DailyCheckIns data={r.attendance.daily} today={today} />
            ) : (
              <p className="py-10 text-center text-sm text-ink-muted">Daily view is available for periods up to 3 months.</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Busiest hours" description="Check-ins by time of day in the selected period" />
          <CardBody>
            {r.attendance.total > 0 ? (
              <BusiestHours data={r.attendance.hourly} />
            ) : (
              <p className="py-10 text-center text-sm text-ink-muted">No check-ins in this period yet.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
