import { ClipboardList, Plus, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PlanSourceBadge, PlanStatusBadge } from "@/components/workouts/plan-badges";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Avatar, PageHeader } from "@/components/ui/page";
import { AccessDenied, EmptyState } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/shared/dates";
import { hasPermission, inGym } from "@/server/auth/context";
import { requireStaffContext } from "@/server/auth/page";
import { aiUsage, listPlans, planCounts } from "@/server/modules/workouts/service";
import { sequential } from "@/server/db/tx";

export const metadata: Metadata = { title: "Workouts" };

const TABS = [
  { key: "pending_review", label: "Needs review" },
  { key: "active", label: "Active" },
  { key: "draft", label: "Drafts" },
  { key: "rejected", label: "Rejected" },
  { key: "archived", label: "Archived" },
] as const;

export default async function WorkoutsPage({ searchParams }: PageProps<"/workouts">) {
  const ctx = await requireStaffContext();
  if (!hasPermission(ctx, "workouts.manage")) return <AccessDenied />;
  const sp = await searchParams;
  const status = TABS.some((t) => t.key === sp.status) ? (sp.status as string) : "pending_review";
  const [plans, counts, usage] = await inGym(ctx, (tx) =>
    sequential(
      () => listPlans(tx, ctx, { status }),
      () => planCounts(tx, ctx),
      () => (hasPermission(ctx, "ai.generate") ? aiUsage(tx, ctx) : Promise.resolve(null)),
    ),
  );

  return (
    <>
      <PageHeader
        title="Workouts"
        description="Every plan is reviewed and approved by a trainer before a member sees it."
        actions={
          <Button asChild>
            <Link href="/workouts/new">
              <Plus /> New plan
            </Link>
          </Button>
        }
      />

      {usage && (
        <Card className="mb-6">
          <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-lime-soft">
                <Sparkles className="size-4 text-lime" />
              </span>
              <div>
                <div className="text-sm font-medium">{usage.configured ? "AI drafting is on" : "AI drafting isn't configured"}</div>
                <div className="text-[12.5px] text-ink-muted">
                  {usage.configured
                    ? `${usage.calls} of ${usage.limit} AI drafts used this month · about $${usage.costUsd.toFixed(2)} in AI costs`
                    : "Plans are built from FITO's rule-based templates until an API key is added."}
                </div>
              </div>
            </div>
            {usage.configured && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-overlay sm:w-48" aria-hidden>
                <div className="h-full rounded-full bg-lime" style={{ width: `${Math.min(100, (usage.calls / Math.max(1, usage.limit)) * 100)}%` }} />
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-line" aria-label="Plan status">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/workouts?status=${t.key}`}
            aria-current={status === t.key ? "page" : undefined}
            className={cn("relative whitespace-nowrap px-3.5 pb-3 pt-1 text-[13.5px] font-medium", status === t.key ? "text-ink" : "text-ink-muted hover:text-ink")}
          >
            {t.label}
            <span className="ml-1.5 text-[12px] text-ink-subtle">{counts[t.key] ?? 0}</span>
            {status === t.key && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-lime" />}
          </Link>
        ))}
      </nav>

      <Card>
        {plans.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={status === "pending_review" ? "Nothing to review" : "No plans here"}
            description={status === "pending_review" ? "AI and template drafts waiting for a trainer appear here." : undefined}
            action={
              <Button asChild variant="secondary">
                <Link href="/workouts/new">Create a plan</Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {plans.map((p) => (
              <li key={p.id}>
                <Link href={`/workouts/${p.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-raised/60">
                  <Avatar name={p.memberName} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="truncate text-[12.5px] text-ink-subtle">
                      {p.memberName} · {p.memberCode}
                      {p.trainerName ? ` · ${p.trainerName}` : ""} · updated {formatDateTime(p.updatedAt, ctx.gym.timezone)}
                    </div>
                  </div>
                  <div className="hidden flex-col items-end gap-1 sm:flex">
                    <PlanStatusBadge status={p.status} />
                    <PlanSourceBadge source={p.source} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
