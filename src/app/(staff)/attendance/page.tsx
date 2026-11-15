import { Activity, DoorOpen, ScanLine, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar, PageHeader, StatCard } from "@/components/ui/page";
import { AccessDenied, EmptyState } from "@/components/ui/states";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { addDays, formatDate, formatTime, isISODate } from "@/shared/dates";
import { hasPermission, inGym } from "@/server/auth/context";
import { requireStaffContext } from "@/server/auth/page";
import { attendanceSummary, listDay } from "@/server/modules/attendance/service";
import { gymToday } from "@/server/modules/members/service";
import { DayPicker } from "./day-picker";
import { RowActions } from "./row-actions";
import { sequential } from "@/server/db/tx";

export const metadata: Metadata = { title: "Attendance" };

export default async function AttendancePage({ searchParams }: PageProps<"/attendance">) {
  const ctx = await requireStaffContext();
  if (!hasPermission(ctx, "attendance.view") && !hasPermission(ctx, "attendance.record")) return <AccessDenied />;
  const sp = await searchParams;
  const today = gymToday(ctx);
  const date = typeof sp.date === "string" && isISODate(sp.date) && sp.date <= today ? sp.date : today;
  const [summary, rows] = await inGym(ctx, (tx) => sequential(() => attendanceSummary(tx, ctx), () => listDay(tx, ctx, date)));
  const canRecord = hasPermission(ctx, "attendance.record");
  const canDelete = hasPermission(ctx, "attendance.override");
  const tz = ctx.gym.timezone;

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Who came in, and when."
        actions={
          canRecord && (
            <Button asChild size="lg">
              <Link href="/attendance/scan">
                <ScanLine /> Open check-in scanner
              </Link>
            </Button>
          )
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Checked in today" value={summary.today} icon={Activity} tone="lime" hint={`${summary.yesterday} yesterday`} />
        <StatCard label="Probably inside now" value={summary.insideNow} icon={DoorOpen} hint={`Within ${ctx.gym.settings.sessionMinutes ?? 90} min, not checked out`} />
        <StatCard label="Daily average" value={summary.avg7} icon={TrendingUp} hint="Last 7 days" />
        <StatCard label="Selected day" value={rows.length} icon={ScanLine} hint={date === today ? "Today" : formatDate(date)} />
      </div>

      <Card>
        <CardHeader
          title={date === today ? "Today's check-ins" : `Check-ins on ${formatDate(date)}`}
          action={<DayPicker date={date} today={today} prev={addDays(date, -1)} next={date < today ? addDays(date, 1) : null} />}
        />
        {rows.length === 0 ? (
          <EmptyState
            icon={ScanLine}
            title="No check-ins"
            description={date === today ? "Scan a member's QR code or check them in by name to record attendance." : "Nobody checked in on this day."}
            action={
              canRecord &&
              date === today && (
                <Button asChild>
                  <Link href="/attendance/scan">Open scanner</Link>
                </Button>
              )
            }
            className="py-10"
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Member</TH>
                <TH>In</TH>
                <TH>Out</TH>
                <TH className="hidden md:table-cell">How</TH>
                <TH className="w-10" />
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link href={`/members/${r.memberId}`} className="flex items-center gap-3 hover:text-lime">
                      <Avatar name={r.fullName} size={30} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{r.fullName}</span>
                        <span className="block text-[12px] text-ink-subtle">{r.memberCode}</span>
                      </span>
                    </Link>
                  </TD>
                  <TD className="tabular text-[13px]">{formatTime(r.checkInAt, tz)}</TD>
                  <TD className="tabular text-[13px] text-ink-muted">{r.checkOutAt ? formatTime(r.checkOutAt, tz) : "—"}</TD>
                  <TD className="hidden md:table-cell">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={r.method === "qr" ? "lime" : "neutral"}>{r.method === "qr" ? "QR" : "Manual"}</Badge>
                      {r.overrideReason && <Badge tone="warning">Override: {r.overrideReason}</Badge>}
                      {r.recordedBy && <span className="text-[12px] text-ink-subtle">by {r.recordedBy}</span>}
                    </div>
                  </TD>
                  <TD>
                    {(canRecord || canDelete) && (
                      <RowActions id={r.id} name={r.fullName} canCheckOut={canRecord && !r.checkOutAt && date === today} canDelete={canDelete} />
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
