import { ArrowLeft, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PlanSourceBadge, PlanStatusBadge } from "@/components/workouts/plan-badges";
import { PlanEditor } from "@/components/workouts/plan-editor";
import { Card, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "@/shared/dates";
import { GOAL_LABELS, type FitnessGoal } from "@/shared/schemas/workout";
import { hasPermission, inGym } from "@/server/auth/context";
import { requireStaffContext } from "@/server/auth/page";
import { getPlanDetail } from "@/server/modules/workouts/service";

export const metadata: Metadata = { title: "Workout plan" };

export default async function PlanPage({ params }: PageProps<"/workouts/[id]">) {
  const { id } = await params;
  const ctx = await requireStaffContext();
  const d = await inGym(ctx, (tx) => getPlanDetail(tx, ctx, id));
  const tz = ctx.gym.timezone;

  return (
    <>
      <Link href="/workouts" className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Workouts
      </Link>
      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <PlanStatusBadge status={d.plan.status} />
          <PlanSourceBadge source={d.plan.source} />
          <span className="text-[12.5px] text-ink-subtle">Version {d.plan.currentVersion}</span>
        </div>
        <h1 className="mt-2 text-[24px] font-semibold tracking-tight">{d.plan.name}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          For{" "}
          <Link href={`/members/${d.member.id}`} className="font-medium text-ink hover:text-lime">
            {d.member.fullName}
          </Link>
          {d.plan.goal ? ` · ${GOAL_LABELS[d.plan.goal as FitnessGoal] ?? d.plan.goal}` : ""}
          {d.approvedBy && d.plan.approvedAt ? ` · approved by ${d.approvedBy} on ${formatDateTime(d.plan.approvedAt, tz)}` : ""}
        </p>
        {d.plan.status === "rejected" && d.plan.rejectedReason && <p className="mt-2 text-sm text-danger">Rejected: {d.plan.rejectedReason}</p>}
      </div>

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <PlanEditor
            key={`${d.plan.id}-${d.plan.currentVersion}-${d.plan.status}`}
            planId={d.plan.id}
            status={d.plan.status}
            initialName={d.plan.name}
            goal={d.plan.goal}
            initialContent={d.content}
            exercises={d.exercises}
            fitness={{
              experienceLevel: d.member.fitness.experienceLevel,
              limitationTags: d.member.fitness.limitationTags,
              trainingDaysPerWeek: d.member.fitness.trainingDaysPerWeek,
              sessionMinutes: d.member.fitness.sessionMinutes,
            }}
            availableEquipment={ctx.gym.settings.availableEquipment ?? []}
            canEdit={hasPermission(ctx, "workouts.manage")}
            canApprove={hasPermission(ctx, "workouts.approve")}
          />
        </div>
        <div className="min-w-0 space-y-6">
          {d.ai && (
            <Card>
              <CardHeader title="AI draft details" />
              <dl className="space-y-2 px-5 py-4 text-[13px]">
                <Row label="Model" value={d.ai.model ?? "—"} />
                <Row label="Result" value={d.ai.status === "succeeded" ? "Passed FITO's checks" : "Failed checks (template used)"} />
                <Row label="Tokens" value={`${d.ai.inputTokens.toLocaleString("en-IN")} in · ${d.ai.outputTokens.toLocaleString("en-IN")} out`} />
                {d.ai.latencyMs && <Row label="Time" value={`${(d.ai.latencyMs / 1000).toFixed(1)}s`} />}
              </dl>
              <p className="flex gap-2 border-t border-line px-5 py-3 text-[12px] text-ink-subtle">
                <Sparkles className="mt-0.5 size-3.5 shrink-0 text-lime" /> AI suggestions are drafts for a qualified trainer to review, not medical advice.
              </p>
            </Card>
          )}
          <Card>
            <CardHeader title="Version history" />
            <ol className="divide-y divide-line">
              {d.versions.map((v) => (
                <li key={v.version} className="px-5 py-3 text-[13px]">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">v{v.version}</span>
                    <span className="text-ink-subtle">{formatDateTime(v.createdAt, tz)}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-3 text-ink-muted">{v.changeSummary ?? "—"}</p>
                  {v.createdBy && <p className="text-[12px] text-ink-subtle">by {v.createdBy}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-subtle">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
