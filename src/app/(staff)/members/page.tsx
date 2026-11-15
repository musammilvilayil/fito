import { FileSpreadsheet, UserPlus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StandingBadge } from "@/components/members/standing-badge";
import { renewalReminder, WhatsAppButton } from "@/components/members/whatsapp-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { AccessDenied, EmptyState } from "@/components/ui/states";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatDate } from "@/shared/dates";
import { formatPhone } from "@/shared/phone";
import { memberListQuery, type MemberFilter } from "@/shared/schemas/member";
import { hasPermission, inGym } from "@/server/auth/context";
import { requireStaffContext } from "@/server/auth/page";
import { listMembers } from "@/server/modules/members/service";

export const metadata: Metadata = { title: "Members" };

const FILTERS: { key: MemberFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "expiring", label: "Expiring" },
  { key: "expired", label: "Expired" },
  { key: "frozen", label: "Frozen" },
  { key: "none", label: "No plan" },
  { key: "inactive", label: "Deactivated" },
];

export default async function MembersPage({ searchParams }: PageProps<"/members">) {
  const ctx = await requireStaffContext();
  if (!hasPermission(ctx, "members.view_all") && !hasPermission(ctx, "workouts.manage")) return <AccessDenied />;
  const sp = await searchParams;
  const query = memberListQuery.parse({
    q: typeof sp.q === "string" ? sp.q : undefined,
    status: typeof sp.status === "string" ? sp.status : undefined,
    page: typeof sp.page === "string" ? sp.page : undefined,
  });
  const result = await inGym(ctx, (tx) => listMembers(tx, ctx, query));
  const canManage = hasPermission(ctx, "members.manage");
  const isTrainerView = !hasPermission(ctx, "members.view_all");

  const href = (patch: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams();
    const merged = { q: query.q, status: query.status === "all" ? undefined : query.status, page: undefined, ...patch };
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === "" || (k === "page" && Number(v) === 1)) continue;
      next.set(k, String(v));
    }
    const s = next.toString();
    return s ? `/members?${s}` : "/members";
  };

  return (
    <>
      <PageHeader
        title={isTrainerView ? "My members" : "Members"}
        description={isTrainerView ? "Members assigned to you." : `${result.counts.all ?? 0} people on your register.`}
        actions={
          (canManage || hasPermission(ctx, "members.add")) && (
            <>
              {canManage && (
                <Button asChild variant="secondary">
                  <Link href="/members/import">
                    <FileSpreadsheet /> Import
                  </Link>
                </Button>
              )}
              <Button asChild>
                <Link href="/members/new">
                  <UserPlus /> Add member
                </Link>
              </Button>
            </>
          )
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
          <SearchInput placeholder="Search name, phone or member ID" className="w-full lg:max-w-sm" />
          <nav className="-mx-1 flex gap-1 overflow-x-auto px-1" aria-label="Filter members">
            {FILTERS.map((f) => {
              const active = query.status === f.key;
              const n = f.key === "all" ? result.counts.all : result.counts[f.key];
              return (
                <Link
                  key={f.key}
                  href={href({ status: f.key === "all" ? undefined : f.key })}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                    active ? "bg-lime-soft text-lime" : "text-ink-muted hover:bg-raised hover:text-ink",
                  )}
                >
                  {f.label}
                  <span className={cn("tabular text-[11.5px]", active ? "text-lime/80" : "text-ink-subtle")}>{n ?? 0}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {result.items.length === 0 ? (
          <EmptyState
            icon={Users}
            title={query.q || query.status !== "all" ? "No members match" : "No members yet"}
            description={
              query.q || query.status !== "all"
                ? "Try a different search or filter."
                : canManage
                  ? "Add members one by one, or import your existing register from Excel or CSV."
                  : "Members assigned to you will appear here."
            }
            action={
              canManage &&
              !query.q &&
              query.status === "all" && (
                <div className="flex gap-2">
                  <Button asChild variant="secondary">
                    <Link href="/members/import">Import from Excel</Link>
                  </Button>
                  <Button asChild>
                    <Link href="/members/new">Add member</Link>
                  </Button>
                </div>
              )
            }
          />
        ) : (
          <>
            {/* Desktop / tablet table */}
            <div className="hidden md:block">
              <Table>
                <THead>
                  <tr>
                    <TH>Member</TH>
                    <TH>Phone</TH>
                    <TH>Membership</TH>
                    <TH className="hidden xl:table-cell">Trainer</TH>
                    <TH className="hidden lg:table-cell">Joined</TH>
                    <TH className="w-24" />
                  </tr>
                </THead>
                <TBody>
                  {result.items.map((m) => (
                    <TR key={m.id} className="group">
                      <TD>
                        <Link href={`/members/${m.id}`} className="flex items-center gap-3">
                          <Avatar name={m.fullName} size={34} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium group-hover:text-lime">{m.fullName}</span>
                            <span className="block text-[12px] text-ink-subtle">{m.memberCode}</span>
                          </span>
                        </Link>
                      </TD>
                      <TD className="tabular text-[13px] text-ink-muted">{m.phone ? formatPhone(m.phone) : "—"}</TD>
                      <TD>
                        <div className="flex flex-col items-start gap-1">
                          <StandingBadge standing={m.standing} />
                          {m.validUntil && m.standing !== "none" && m.standing !== "inactive" && (
                            <span className="text-[12px] text-ink-subtle">
                              {m.planName} · until {formatDate(m.validUntil)}
                            </span>
                          )}
                        </div>
                      </TD>
                      <TD className="hidden text-[13px] text-ink-muted xl:table-cell">{m.trainerName ?? "—"}</TD>
                      <TD className="hidden text-[13px] text-ink-muted lg:table-cell">{formatDate(m.joinedOn)}</TD>
                      <TD className="text-right">
                        {(m.standing === "expiring" || m.standing === "expired") && (
                          <WhatsAppButton
                            phone={m.phone}
                            compact
                            label={`Send renewal reminder to ${m.fullName}`}
                            message={renewalReminder(m.fullName, ctx.gym.name, m.validUntil)}
                          />
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-line md:hidden">
              {result.items.map((m) => (
                <li key={m.id}>
                  <Link href={`/members/${m.id}`} className="flex items-center gap-3 px-4 py-3.5 active:bg-raised">
                    <Avatar name={m.fullName} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{m.fullName}</div>
                      <div className="mt-0.5 truncate text-[12.5px] text-ink-subtle">
                        {m.memberCode}
                        {m.phone ? ` · ${formatPhone(m.phone)}` : ""}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StandingBadge standing={m.standing} />
                      {m.validUntil && m.standing !== "none" && (
                        <span className="text-[11.5px] text-ink-subtle">{formatDate(m.validUntil)}</span>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination page={result.page} pageSize={result.pageSize} total={result.total} hrefFor={(p) => href({ page: p })} />
          </>
        )}
      </Card>
    </>
  );
}
