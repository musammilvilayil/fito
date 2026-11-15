"use client";

import { FileText, LayoutTemplate, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormError, Select, Textarea } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { LIMITATION_LABELS } from "@/shared/exercise-safety";
import { GOAL_LABELS, LEVEL_LABELS, type ExperienceLevel, type FitnessGoal } from "@/shared/schemas/workout";

type Selected = {
  id: string;
  name: string;
  fitness: { goal: string | null; level: string | null; days: number | null; minutes: number | null; limitationTags: string[]; clearanceRequired: boolean };
};

export function NewPlanForm({
  members,
  selected,
  canUseAi,
  aiConfigured,
  aiLeft,
}: {
  members: { id: string; name: string; code: string }[];
  selected: Selected | null;
  canUseAi: boolean;
  aiConfigured: boolean;
  aiLeft: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"ai" | "template" | "blank">(canUseAi ? "ai" : "template");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const f = selected?.fitness;
  const profileComplete = Boolean(f?.goal && f.level && f.days && f.minutes);

  const options = [
    ...(canUseAi
      ? [{ key: "ai" as const, icon: Sparkles, title: "Draft with AI", body: aiConfigured ? `Claude drafts a plan from the profile and your exercise library. ${aiLeft} left this month.` : "AI isn't configured yet; FITO will use a template instead." }]
      : []),
    { key: "template" as const, icon: LayoutTemplate, title: "Start from a template", body: "A rule-based split matched to goal, level, days and limitations." },
    { key: "blank" as const, icon: FileText, title: "Build from scratch", body: "An empty plan you fill in yourself." },
  ];

  async function create() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ planId: string; notice: string | null; source: string }>("/workouts/generate", {
        body: { memberId: selected.id, mode, instructions: instructions || null },
      });
      if (r.notice) toast.message(r.notice);
      else toast.success(mode === "blank" ? "Blank plan created" : "Draft ready for review");
      router.push(`/workouts/${r.planId}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Member" />
        <CardBody className="space-y-4">
          <Field label="Choose a member" htmlFor="np-member">
            <Select id="np-member" value={selected?.id ?? ""} onChange={(e) => router.push(e.target.value ? `/workouts/new?member=${e.target.value}` : "/workouts/new")}>
              <option value="">Select…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.code})
                </option>
              ))}
            </Select>
          </Field>
          {selected && f && (
            <div className="rounded-xl border border-line bg-raised/50 p-4 text-sm">
              {profileComplete ? (
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <span>
                    <span className="text-ink-subtle">Goal </span>
                    {GOAL_LABELS[f.goal as FitnessGoal]}
                  </span>
                  <span>
                    <span className="text-ink-subtle">Level </span>
                    {LEVEL_LABELS[f.level as ExperienceLevel]}
                  </span>
                  <span>
                    <span className="text-ink-subtle">Schedule </span>
                    {f.days} days × {f.minutes} min
                  </span>
                </div>
              ) : (
                <p className="text-warning">
                  The fitness profile isn&apos;t complete.{" "}
                  <Link href={`/members/${selected.id}`} className="font-medium underline">
                    Complete it on the member&apos;s page
                  </Link>{" "}
                  to use AI or templates.
                </p>
              )}
              {f.limitationTags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {f.limitationTags.map((t) => (
                    <Badge key={t} tone="warning">
                      {LIMITATION_LABELS[t as keyof typeof LIMITATION_LABELS] ?? t}
                    </Badge>
                  ))}
                </div>
              )}
              {f.clearanceRequired && <p className="mt-3 text-warning">Health screening needs clearance first (record it on the member&apos;s page).</p>}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="How do you want to start?" />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Plan source">
            {options.map((o) => (
              <button
                key={o.key}
                role="radio"
                aria-checked={mode === o.key}
                onClick={() => setMode(o.key)}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors",
                  mode === o.key ? "border-lime/60 bg-lime-soft" : "border-line hover:border-line-strong",
                )}
              >
                <o.icon className={cn("size-5", mode === o.key ? "text-lime" : "text-ink-subtle")} />
                <div className="mt-3 text-sm font-semibold">{o.title}</div>
                <div className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{o.body}</div>
              </button>
            ))}
          </div>
          {mode === "ai" && (
            <Field label="Notes for the AI (optional)" htmlFor="np-ins" hint="e.g. Focus on posture; no running; include core every day">
              <Textarea id="np-ins" rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={500} />
            </Field>
          )}
          <FormError message={error} />
          <div className="flex items-center justify-end gap-3">
            {busy && mode === "ai" && (
              <span className="inline-flex items-center gap-2 text-[13px] text-ink-muted">
                <Loader2 className="size-4 animate-spin text-lime" /> Drafting and checking the plan… this can take up to a minute.
              </span>
            )}
            <Button size="lg" loading={busy} disabled={!selected || (mode !== "blank" && (!profileComplete || f?.clearanceRequired))} onClick={() => void create()}>
              {mode === "blank" ? "Create blank plan" : "Create draft for review"}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
