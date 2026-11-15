"use client";

import { AlertTriangle, Archive, ArrowDown, ArrowUp, Check, CopyPlus, Plus, Save, Trash2, X, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { api, ApiError, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { WEEKDAYS, type PlanContent, type PlanExercise } from "@/shared/schemas/workout";
import { checkPlan, estimateDayMinutes, type PlanIssue } from "@/shared/workout-rules";
import { ExercisePicker, Thumb, type LibraryExercise } from "./exercise-picker";

type Fitness = {
  experienceLevel: string | null;
  limitationTags: string[];
  trainingDaysPerWeek: number | null;
  sessionMinutes: number | null;
};

export function PlanEditor({
  planId,
  status,
  initialName,
  goal,
  initialContent,
  exercises: initialExercises,
  fitness,
  availableEquipment,
  canEdit,
  canApprove,
}: {
  planId: string;
  status: string;
  initialName: string;
  goal: string | null;
  initialContent: PlanContent;
  exercises: Record<string, LibraryExercise>;
  fitness: Fitness;
  availableEquipment: string[];
  canEdit: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const editable = canEdit && ["draft", "pending_review", "rejected"].includes(status);
  const [name, setName] = useState(initialName);
  const [content, setContent] = useState<PlanContent>(initialContent);
  const [library, setLibrary] = useState<Record<string, LibraryExercise>>(initialExercises);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const issues: PlanIssue[] = useMemo(
    () =>
      checkPlan(content, {
        exercises: new Map(Object.entries(library)),
        experienceLevel: fitness.experienceLevel,
        limitationTags: fitness.limitationTags,
        trainingDaysPerWeek: fitness.trainingDaysPerWeek,
        sessionMinutes: fitness.sessionMinutes,
        availableEquipment,
      }),
    [content, library, fitness, availableEquipment],
  );
  const issuesFor = (dayKey: string, exerciseId?: string) => issues.filter((i) => i.dayKey === dayKey && (exerciseId === undefined || i.exerciseId === exerciseId));

  function update(fn: (c: PlanContent) => void) {
    setContent((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setDirty(true);
  }

  async function save(): Promise<boolean> {
    setSaving(true);
    try {
      await api(`/workouts/${planId}`, { method: "PATCH", body: { name, goal, content, changeSummary: "Edited by trainer" } });
      setDirty(false);
      toast.success("Saved as a new version");
      router.refresh();
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function act(path: string, body: unknown, msg: string, goTo?: (r: { planId?: string }) => string) {
    try {
      const r = await api<{ planId?: string }>(`/workouts/${planId}/${path}`, { body });
      toast.success(msg);
      if (goTo) router.push(goTo(r));
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const errors = issues.filter((i) => i.level === "error");

  return (
    <div className="space-y-6">
      {(editable || canApprove) && (
        <div className="sticky top-14 z-20 -mx-4 flex flex-wrap items-center gap-2 border-y border-line bg-canvas/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border lg:top-3">
          {editable && (
            <Input aria-label="Plan name" value={name} onChange={(e) => (setName(e.target.value), setDirty(true))} className="h-9 min-w-0 flex-1 sm:max-w-xs" />
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            {editable && (
              <Button variant="secondary" size="sm" disabled={!dirty} loading={saving} onClick={() => void save()}>
                <Save /> {dirty ? "Save changes" : "Saved"}
              </Button>
            )}
            {canApprove && (status === "pending_review" || status === "draft") && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setRejectOpen(true)}>
                  <X /> Reject
                </Button>
                <Button size="sm" disabled={errors.length > 0 || content.days.length === 0} onClick={() => setApproveOpen(true)}>
                  <Check /> Approve &amp; assign
                </Button>
              </>
            )}
            {canEdit && (status === "active" || status === "archived") && (
              <Button variant="secondary" size="sm" onClick={() => void act("revise", {}, "New draft created from this plan", (r) => `/workouts/${r.planId}`)}>
                <CopyPlus /> Revise
              </Button>
            )}
            {canEdit && status !== "archived" && (
              <Button variant="ghost" size="sm" onClick={() => void act("archive", {}, "Plan archived")}>
                <Archive /> Archive
              </Button>
            )}
          </div>
        </div>
      )}

      {issues.length > 0 && (
        <Card className={errors.length ? "border-danger/40" : "border-warning/40"}>
          <CardHeader
            title={errors.length ? "Fix before approving" : "Safety notes for the trainer"}
            description="FITO checks every plan against the member's level, reported limitations, schedule and the gym's equipment."
          />
          <ul className="divide-y divide-line">
            {issues.map((i, n) => (
              <li key={n} className="flex items-start gap-2.5 px-5 py-2.5 text-[13px]">
                {i.level === "error" ? <XCircle className="mt-0.5 size-4 shrink-0 text-danger" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />}
                <span>{i.message}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {content.days.length === 0 && (
        <Card>
          <CardBody className="py-10 text-center text-sm text-ink-muted">This plan has no workout days yet.</CardBody>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {content.days.map((day, di) => (
          <Card key={day.key} className={issuesFor(day.key).some((i) => i.level === "error") ? "border-danger/40" : undefined}>
            <div className="flex flex-wrap items-start gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0 flex-1">
                {editable ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_110px]">
                    <Input aria-label="Day title" value={day.title} onChange={(e) => update((c) => void (c.days[di]!.title = e.target.value))} className="h-9 font-semibold" />
                    <Select
                      aria-label="Weekday"
                      className="h-9"
                      value={day.weekday ?? ""}
                      onChange={(e) => update((c) => void (c.days[di]!.weekday = e.target.value === "" ? null : Number(e.target.value)))}
                    >
                      <option value="">Any day</option>
                      {WEEKDAYS.map((w, i) => (
                        <option key={w} value={i}>
                          {w}
                        </option>
                      ))}
                    </Select>
                    <Input
                      aria-label="Focus"
                      placeholder="Focus, e.g. Chest and triceps"
                      value={day.focus}
                      onChange={(e) => update((c) => void (c.days[di]!.focus = e.target.value))}
                      className="h-9 sm:col-span-2"
                    />
                  </div>
                ) : (
                  <>
                    <h3 className="font-semibold">
                      {day.weekday !== null && day.weekday !== undefined && <span className="mr-2 text-lime">{WEEKDAYS[day.weekday]}</span>}
                      {day.title}
                    </h3>
                    {day.focus && <p className="text-[13px] text-ink-muted">{day.focus}</p>}
                  </>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className="tabular whitespace-nowrap text-[12px] text-ink-subtle">~{estimateDayMinutes(day)} min</span>
                {editable && content.days.length > 1 && (
                  <Button variant="ghost" size="icon" aria-label={`Remove ${day.title}`} onClick={() => update((c) => void c.days.splice(di, 1))}>
                    <Trash2 />
                  </Button>
                )}
              </div>
            </div>
            <ol className="divide-y divide-line">
              {day.exercises.map((e, ei) => {
                const meta = library[e.exerciseId];
                const flagged = issuesFor(day.key, e.exerciseId);
                return (
                  <li key={`${e.exerciseId}-${ei}`} className={cn("px-5 py-3", flagged.length && "bg-warning/5")}>
                    <div className="flex items-start gap-3">
                      <Thumb src={meta?.images[0]} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {ei + 1}. {meta?.name ?? e.exerciseId}
                            </div>
                            <div className="truncate text-[12px] capitalize text-ink-subtle">{meta ? `${meta.primaryMuscles.join(", ")} · ${meta.equipment}` : "Unknown exercise"}</div>
                          </div>
                          {editable && (
                            <div className="flex shrink-0">
                              <IconBtn label="Move up" disabled={ei === 0} onClick={() => update((c) => moveItem(c.days[di]!.exercises, ei, -1))}>
                                <ArrowUp />
                              </IconBtn>
                              <IconBtn label="Move down" disabled={ei === day.exercises.length - 1} onClick={() => update((c) => moveItem(c.days[di]!.exercises, ei, 1))}>
                                <ArrowDown />
                              </IconBtn>
                              <IconBtn label={`Remove ${meta?.name ?? "exercise"}`} disabled={day.exercises.length === 1} onClick={() => update((c) => void c.days[di]!.exercises.splice(ei, 1))}>
                                <Trash2 />
                              </IconBtn>
                            </div>
                          )}
                        </div>
                        {editable ? (
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            <MiniInput label="Sets" type="number" value={String(e.sets)} onChange={(v) => update((c) => void (c.days[di]!.exercises[ei]!.sets = clampInt(v, 1, 10)))} />
                            <MiniInput label="Reps" value={e.reps} onChange={(v) => update((c) => void (c.days[di]!.exercises[ei]!.reps = v))} />
                            <MiniInput label="Rest (s)" type="number" value={String(e.restSeconds)} onChange={(v) => update((c) => void (c.days[di]!.exercises[ei]!.restSeconds = clampInt(v, 0, 600)))} />
                            <div className="col-span-3">
                              <Input
                                aria-label="Coaching note"
                                className="h-8 text-[13px]"
                                placeholder="Coaching note (optional)"
                                value={e.notes}
                                onChange={(ev) => update((c) => void (c.days[di]!.exercises[ei]!.notes = ev.target.value))}
                              />
                            </div>
                          </div>
                        ) : (
                          <p className="tabular mt-1 text-[13px]">
                            {e.sets} × {e.reps}
                            <span className="text-ink-subtle"> · rest {e.restSeconds}s</span>
                            {e.notes && <span className="block text-[12.5px] text-ink-muted">{e.notes}</span>}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
            {editable && (
              <div className="border-t border-line px-5 py-3">
                <Button variant="ghost" size="sm" onClick={() => setPickerFor(di)} disabled={day.exercises.length >= 15}>
                  <Plus /> Add exercise
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>

      {editable && content.days.length < 7 && (
        <Button
          variant="secondary"
          onClick={() => {
            const index = content.days.length;
            update((c) => {
              const n = c.days.length + 1;
              let key = `day${n}`;
              while (c.days.some((d) => d.key === key)) key = `${key}b`;
              c.days.push({ key, title: `Day ${n}`, focus: "", weekday: null, exercises: [] as PlanExercise[] });
            });
            setPickerFor(index);
          }}
        >
          <Plus /> Add workout day
        </Button>
      )}

      <Card>
        <CardHeader title="Warm-up, cool-down and notes" />
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {(["warmup", "cooldown", "notes"] as const).map((k) => (
            <Field key={k} label={k === "warmup" ? "Warm-up" : k === "cooldown" ? "Cool-down" : "Progression notes"} htmlFor={`pc-${k}`}>
              {editable ? (
                <Textarea id={`pc-${k}`} rows={3} value={content[k]} onChange={(e) => update((c) => void (c[k] = e.target.value))} />
              ) : (
                <p id={`pc-${k}`} className="text-sm text-ink-muted">
                  {content[k] || "—"}
                </p>
              )}
            </Field>
          ))}
        </CardBody>
      </Card>

      <ExercisePicker
        open={pickerFor !== null}
        onClose={() => setPickerFor(null)}
        onPick={(ex) => {
          const di = pickerFor!;
          setLibrary((l) => ({ ...l, [ex.id]: ex }));
          update((c) => void c.days[di]!.exercises.push({ exerciseId: ex.id, sets: 3, reps: "10-12", restSeconds: 60, notes: "" }));
          setPickerFor(null);
        }}
      />

      {approveOpen && (
        <ApproveDialog
          warnings={issues.filter((i) => i.level === "warning")}
          dirty={dirty}
          onClose={() => setApproveOpen(false)}
          onApprove={async (ack) => {
            if (dirty && !(await save())) return;
            try {
              await api(`/workouts/${planId}/approve`, { body: { acknowledgeWarnings: ack } });
              toast.success("Plan approved. The member can see it now.");
              setApproveOpen(false);
              router.refresh();
            } catch (err) {
              toast.error(err instanceof ApiError ? err.message : errorMessage(err));
            }
          }}
        />
      )}
      {rejectOpen && <RejectDialog onClose={() => setRejectOpen(false)} onReject={(reason) => act("reject", { reason }, "Plan rejected").then(() => setRejectOpen(false))} />}
    </div>
  );
}

function moveItem<T>(arr: T[], i: number, dir: -1 | 1) {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j]!, arr[i]!];
}

function clampInt(v: string, min: number, max: number) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-lg text-ink-subtle hover:bg-raised hover:text-ink disabled:opacity-30 [&_svg]:size-3.5"
    >
      {children}
    </button>
  );
}

function MiniInput({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-ink-subtle">{label}</span>
      <Input type={type} inputMode={type === "number" ? "numeric" : undefined} value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-full min-w-0 text-[13px]" />
    </label>
  );
}

function ApproveDialog({
  warnings,
  dirty,
  onClose,
  onApprove,
}: {
  warnings: PlanIssue[];
  dirty: boolean;
  onClose: () => void;
  onApprove: (acknowledge: boolean) => Promise<void>;
}) {
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Approve and assign this plan?"
      description={`The member will see it in their FITO app immediately${dirty ? ". Your unsaved changes will be saved first" : ""}. Any current plan is archived.`}
    >
      {warnings.length > 0 && (
        <div className="mb-4 space-y-3">
          <ul className="space-y-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-[13px]">
            {warnings.map((w, i) => (
              <li key={i} className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /> {w.message}
              </li>
            ))}
          </ul>
          <Checkbox checked={ack} onChange={(e) => setAck(e.target.checked)} label="I've reviewed these notes and the plan is suitable for this member." />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          loading={busy}
          disabled={warnings.length > 0 && !ack}
          onClick={async () => {
            setBusy(true);
            await onApprove(warnings.length > 0);
            setBusy(false);
          }}
        >
          <Check /> Approve plan
        </Button>
      </div>
    </Dialog>
  );
}

function RejectDialog({ onClose, onReject }: { onClose: () => void; onReject: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Reject this draft?" description="The member won't see it. You can still edit it later." size="sm">
      <Field label="Reason" htmlFor="rej" required>
        <Input id="rej" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Too much volume for a beginner" />
      </Field>
      <FormError message={error} />
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="danger"
          loading={busy}
          disabled={!reason.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await onReject(reason);
            } catch (err) {
              setError(errorMessage(err));
            }
            setBusy(false);
          }}
        >
          Reject
        </Button>
      </div>
    </Dialog>
  );
}
