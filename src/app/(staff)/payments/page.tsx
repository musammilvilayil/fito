import { CalendarDays, Download, FileText, IndianRupee, ReceiptIndianRupee, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { WhatsAppButton } from "@/components/members/whatsapp-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Avatar, PageHeader, StatCard } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { AccessDenied, EmptyState } from "@/components/ui/states";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { addDays, diffDays, formatDate, formatDateTime } from "@/shared/dates";
import { formatINR } from "@/shared/money";
import { METHOD_LABELS, PAYMENT_METHODS, paymentListQuery } from "@/shared/schemas/billing";
import { hasPermission, inGym } from "@/server/auth/context";
import { requireStaffContext } from "@/server/auth/page";
import { gymToday } from "@/server/modules/members/service";
import { dailyCollections, listDues, listPayments, paymentSummary } from "@/server/modules/payments/service";
import { CollectionsChart } from "./collections-chart";
import { RangeFilter } from "./range-filter";

export const metadata: Metadata = { title: "Payments" };

function presets(today: string) {
  const monthStart = `${today.slice(0, 8)}01`;
  const lastMonthEnd = addDays(monthStart, -1);
  return [
    { label: "Today", from: today, to: today },
    { label: "Yesterday", from: addDays(today, -1), to: addDays(today, -1) },
    { label: "Last 7 days", from: addDays(today, -6), to: today },
    { label: "This month", from: monthStart, to: today },
    { label: "Last month", from: `${lastMonthEnd.slice(0, 8)}01`, to: lastMonthEnd },
  ];
}

export default async function PaymentsPage({ searchParams }: PageProps<"/payments">) {
  const ctx = await requireStaffContext();
  if (!hasPermission(ctx, "payments.view")) return <AccessDenied />;
  const sp = await searchParams;
  const view = sp.view === "dues" ? "dues" : "collections";
  const today = gymToday(ctx);
  const query = paymentListQuery.parse({
    from: typeof sp.from === "string" ? sp.from : undefined,
    to: typeof sp.to === "string" ? sp.to : undefined,
    method: typeof sp.method === "string" && sp.method ? sp.method : undefined,
    page: typeof sp.page === "string" ? sp.page : undefined,
  });

  const [summary, list, daily, dues] = await inGym(ctx, async (tx) => {
    const s = await paymentSummary(tx, ctx);
    if (view === "dues") return [s, null, null, await listDues(tx, ctx)] as const;
    const l = await listPayments(tx, ctx, query);
    const span = diffDays(l.from, l.to);
    const d = span >= 1 && span <= 92 ? await dailyCollections(tx, ctx, l.from, l.to) : null;
    return [s, l, d, null] as const;
  });

  const qs = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged: Record<string, string | undefined> = { view: view === "dues" ? "dues" : undefined, from: query.from, to: query.to, method: query.method, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const s = next.toString();
    return s ? `/payments?${s}` : "/payments";
  };

  return (
    <>
      <PageHeader title="Payments" description="Collections, receipts and outstanding dues." />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard label="Collected today" value={formatINR(summary.today)} icon={IndianRupee} tone="lime" hint={`${summary.todayCount} payment${summary.todayCount === 1 ? "" : "s"}`} />
        <StatCard label="This month" value={formatINR(summary.month)} icon={CalendarDays} hint="Net of refunds" />
        <StatCard
          label="Outstanding dues"
          value={formatINR(summary.outstanding)}
          icon={Wallet}
          tone={summary.outstanding > 0 ? "warning" : "default"}
          hint={`${summary.membersWithDues} member${summary.membersWithDues === 1 ? "" : "s"}`}
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <div className="mb-5 flex gap-1 border-b border-line">
        {(["collections", "dues"] as const).map((v) => (
          <Link
            key={v}
            href={v === "dues" ? "/payments?view=dues" : "/payments"}
            className={cn("relative px-3.5 pb-3 pt-1 text-[13.5px] font-medium", view === v ? "text-ink" : "text-ink-muted hover:text-ink")}
            aria-current={view === v ? "page" : undefined}
          >
            {v === "collections" ? "Collections" : `Dues${summary.membersWithDues ? ` (${summary.membersWithDues})` : ""}`}
            {view === v && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-lime" />}
          </Link>
        ))}
      </div>

      {view === "collections" && list && (
        <>
          <RangeFilter
            from={list.from}
            to={list.to}
            method={query.method ?? ""}
            today={today}
            presets={presets(today)}
            methods={PAYMENT_METHODS.map((m) => ({ value: m, label: METHOD_LABELS[m] }))}
          />

          <div className="mb-6 grid gap-6 xl:grid-cols-[1fr_320px]">
            <Card>
              <CardHeader
                title="Daily collections"
                description={`${formatDate(list.from)} – ${formatDate(list.to)} · net of refunds`}
              />
              <CardBody>
                {daily ? (
                  <CollectionsChart data={daily} today={today} />
                ) : (
                  <p className="py-10 text-center text-sm text-ink-muted">
                    {list.from === list.to ? "Pick a range of 2 days or more to see the daily chart." : "Daily chart is shown for ranges up to 3 months."}
                  </p>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="By method" />
              <CardBody className="space-y-3">
                <MethodRow label="Collected" value={list.collected} strong />
                {list.refunded > 0 && <MethodRow label="Refunded" value={-list.refunded} />}
                <div className="border-t border-line pt-3">
                  {Object.entries(list.byMethod).length === 0 ? (
                    <p className="text-sm text-ink-muted">No payments in this range.</p>
                  ) : (
                    Object.entries(list.byMethod)
                      .sort((a, b) => b[1] - a[1])
                      .map(([m, v]) => <MethodRow key={m} label={METHOD_LABELS[m as keyof typeof METHOD_LABELS]} value={v} />)
                  )}
                </div>
                <div className="flex justify-between border-t border-line pt-3 font-semibold">
                  <span>Net</span>
                  <span className="tabular">{formatINR(list.net)}</span>
                </div>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Payments"
              description={`${list.total} in this range`}
              action={
                <Button asChild variant="secondary" size="sm">
                  <a href={`/api/v1/payments/export?${new URLSearchParams({ from: list.from, to: list.to, ...(query.method ? { method: query.method } : {}) })}`}>
                    <Download /> Export CSV
                  </a>
                </Button>
              }
            />
            {list.items.length === 0 ? (
              <EmptyState icon={ReceiptIndianRupee} title="No payments in this range" description="Payments are recorded from a member's profile when you sell or renew a membership." className="py-10" />
            ) : (
              <>
                <Table>
                  <THead>
                    <tr>
                      <TH>Date</TH>
                      <TH>Member</TH>
                      <TH className="hidden md:table-cell">Receipt</TH>
                      <TH className="hidden sm:table-cell">Method</TH>
                      <TH className="text-right">Amount</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {list.items.map((p) => (
                      <TR key={p.id} className={p.status === "void" ? "opacity-55" : undefined}>
                        <TD className="whitespace-nowrap text-[13px] text-ink-muted">{formatDateTime(p.paidAt, ctx.gym.timezone)}</TD>
                        <TD>
                          <Link href={`/members/${p.memberId}`} className="font-medium hover:text-lime">
                            {p.memberName}
                          </Link>
                          <div className="text-[12px] text-ink-subtle">
                            {p.planName ?? "—"}
                            {p.recordedBy ? ` · by ${p.recordedBy}` : ""}
                          </div>
                        </TD>
                        <TD className="hidden font-mono text-[12px] md:table-cell">
                          {p.receiptNumber ? (
                            <a href={`/api/v1/payments/${p.id}/receipt`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-lime">
                              <FileText className="size-3.5" /> {p.receiptNumber}
                            </a>
                          ) : (
                            <span className="text-ink-subtle">—</span>
                          )}
                        </TD>
                        <TD className="hidden text-[13px] sm:table-cell">{METHOD_LABELS[p.method]}</TD>
                        <TD className="tabular text-right">
                          <span className={p.kind === "refund" ? "text-danger" : p.status === "void" ? "line-through" : "font-medium"}>
                            {p.kind === "refund" ? "−" : ""}
                            {formatINR(p.amountPaise)}
                          </span>
                          {p.status === "void" && (
                            <div>
                              <Badge tone="danger">Void</Badge>
                            </div>
                          )}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                <Pagination page={list.page} pageSize={list.pageSize} total={list.total} hrefFor={(page) => qs({ page: String(page) })} />
              </>
            )}
          </Card>
        </>
      )}

      {view === "dues" && dues && (
        <Card>
          <CardHeader title="Members with outstanding dues" description="Part-paid or unpaid memberships." />
          {dues.length === 0 ? (
            <EmptyState icon={Wallet} title="No outstanding dues" description="Everyone is paid up." className="py-10" />
          ) : (
            <ul className="divide-y divide-line">
              {dues.map((d) => (
                <li key={d.memberId} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={d.fullName} size={34} />
                  <Link href={`/members/${d.memberId}`} className="min-w-0 flex-1 hover:text-lime">
                    <div className="truncate text-sm font-medium">{d.fullName}</div>
                    <div className="text-[12px] text-ink-subtle">
                      {d.memberCode} · since {formatDate(d.oldest)}
                    </div>
                  </Link>
                  <span className="tabular font-semibold text-warning">{formatINR(d.duePaise)}</span>
                  <WhatsAppButton
                    phone={d.phone}
                    compact
                    label={`Remind ${d.fullName} about dues`}
                    message={`Hi ${d.fullName.split(" ")[0]}, a balance of ${formatINR(d.duePaise)} is pending on your ${ctx.gym.name} membership. Please clear it at the front desk. Thank you!`}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}

function MethodRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex justify-between py-0.5 text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className={cn("tabular", strong ? "font-semibold text-ink" : "text-ink")}>
        {formatINR(value)}
      </span>
    </div>
  );
}
