"use client";

import { HeartPulse, Pencil, ShieldCheck, Stethoscope } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";
import { fieldError, useApiForm } from "@/lib/use-api-form";
import { LIMITATION_LABELS, LIMITATION_TAGS } from "@/shared/exercise-safety";
import {
  EXPERIENCE_LEVELS,
  FITNESS_GOALS,
  fitnessProfileSchema,
  GOAL_LABELS,
  HEALTH_QUESTIONS,
  LEVEL_LABELS,
  type ExperienceLevel,
  type FitnessGoal,
} from "@/shared/schemas/workout";

export type FitnessInfo = {
  fitnessGoal: string | null;
  experienceLevel: string | null;
  trainingDaysPerWeek: number | null;
  sessionMinutes: number | null;
  exercisePreferences: string | null;
  limitations: string | null;
  limitationTags: string[];
  medicalClearanceRequired: boolean;
  medicalClearanceNote: string | null;
  healthScreening: Record<string, unknown> | null;
};

export function FitnessProfileCard({
  memberId,
  fitness,
  canEdit,
  canClear,
  selfService,
}: {
  memberId: string;
  fitness: FitnessInfo;
  canEdit: boolean;
  canClear: boolean;
  /** Member editing their own profile (wording changes). */
  selfService?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [screening, setScreening] = useState(false);
  const [clearing, setClearing] = useState(false);
  const complete = Boolean(fitness.fitnessGoal && fitness.experienceLevel && fitness.trainingDaysPerWeek && fitness.sessionMinutes);
  const screened = Boolean(fitness.healthScreening && "answeredAt" in fitness.healthScreening);

  return (
    <Card>
      <CardHeader
        title="Fitness profile"
        description={complete ? undefined : selfService ? "Tell your trainer about your goals." : "Needed before a workout plan can be generated."}
        action={
          canEdit && (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <Pencil /> {complete ? "Edit" : "Complete"}
            </Button>
          )
        }
      />
      <CardBody className="space-y-4 text-sm">
        {fitness.medicalClearanceRequired && (
          <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-3">
            <Stethoscope className="mt-0.5 size-4 shrink-0 text-warning" />
            <div className="flex-1">
              <p className="font-medium text-warning">Clearance needed before training plans</p>
              <p className="mt-0.5 text-[12.5px] text-ink-muted">
                The health screening or a reported condition needs a trainer to confirm it&apos;s safe to train (e.g. after seeing a doctor&apos;s note).
              </p>
              {canClear && (
                <Button size="sm" variant="secondary" className="mt-2" onClick={() => setClearing(true)}>
                  <ShieldCheck /> Record clearance
                </Button>
              )}
            </div>
          </div>
        )}
        {complete ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Item label="Goal" value={GOAL_LABELS[fitness.fitnessGoal as FitnessGoal] ?? fitness.fitnessGoal} />
            <Item label="Level" value={LEVEL_LABELS[fitness.experienceLevel as ExperienceLevel] ?? fitness.experienceLevel} />
            <Item label="Days per week" value={String(fitness.trainingDaysPerWeek)} />
            <Item label="Session" value={`${fitness.sessionMinutes} min`} />
          </dl>
        ) : (
          <p className="text-ink-muted">Not filled in yet.</p>
        )}
        {fitness.limitationTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {fitness.limitationTags.map((t) => (
              <Badge key={t} tone="warning">
                {LIMITATION_LABELS[t as keyof typeof LIMITATION_LABELS] ?? t}
              </Badge>
            ))}
          </div>
        )}
        {fitness.limitations && <p className="text-[13px] text-ink-muted">“{fitness.limitations}”</p>}
        {fitness.exercisePreferences && <p className="text-[13px] text-ink-muted">Prefers: {fitness.exercisePreferences}</p>}
        {fitness.medicalClearanceNote && !fitness.medicalClearanceRequired && (
          <p className="flex items-center gap-1.5 text-[12.5px] text-success">
            <ShieldCheck className="size-3.5" /> Cleared: {fitness.medicalClearanceNote}
          </p>
        )}
        {canEdit && (
          <button onClick={() => setScreening(true)} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-lime hover:underline">
            <HeartPulse className="size-3.5" /> {screened ? "Update health screening" : "Health screening (PAR-Q)"}
          </button>
        )}
      </CardBody>

      {editing && (
        <ProfileDialog
          memberId={memberId}
          fitness={fitness}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            toast.success("Fitness profile saved");
            router.refresh();
          }}
        />
      )}
      {screening && (
        <ScreeningDialog
          memberId={memberId}
          current={fitness.healthScreening}
          onClose={() => setScreening(false)}
          onSaved={(flagged) => {
            setScreening(false);
            toast.success(flagged ? "Saved. A trainer needs to record clearance." : "Health screening saved");
            router.refresh();
          }}
        />
      )}
      {clearing && (
        <ClearanceDialog
          memberId={memberId}
          onClose={() => setClearing(false)}
          onSaved={() => {
            setClearing(false);
            toast.success("Clearance recorded");
            router.refresh();
          }}
        />
      )}
    </Card>
  );
}

function Item({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[12px] text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 font-medium">{value ?? "—"}</dd>
    </div>
  );
}

function ProfileDialog({ memberId, fitness, onClose, onSaved }: { memberId: string; fitness: FitnessInfo; onClose: () => void; onSaved: () => void }) {
  const { form, formError, run, errors, submitting } = useApiForm(fitnessProfileSchema, {
    fitnessGoal: (fitness.fitnessGoal ?? "general_fitness") as FitnessGoal,
    experienceLevel: (fitness.experienceLevel ?? "beginner") as ExperienceLevel,
    trainingDaysPerWeek: fitness.trainingDaysPerWeek ?? 3,
    sessionMinutes: fitness.sessionMinutes ?? 60,
    exercisePreferences: fitness.exercisePreferences ?? "",
    limitations: fitness.limitations ?? "",
    limitationTags: fitness.limitationTags as never,
  });
  const reg = form.register;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Fitness profile" size="lg">
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async (values) => {
            await api(`/members/${memberId}/fitness`, { method: "PUT", body: values });
            onSaved();
          });
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Main goal" htmlFor="f-goal">
            <Select id="f-goal" {...reg("fitnessGoal")}>
              {FITNESS_GOALS.map((g) => (
                <option key={g} value={g}>
                  {GOAL_LABELS[g]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Experience" htmlFor="f-level">
            <Select id="f-level" {...reg("experienceLevel")}>
              {EXPERIENCE_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABELS[l]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Training days per week" htmlFor="f-days" error={fieldError(errors, "trainingDaysPerWeek")}>
            <Input id="f-days" type="number" min={1} max={7} {...reg("trainingDaysPerWeek")} />
          </Field>
          <Field label="Minutes per session" htmlFor="f-min" error={fieldError(errors, "sessionMinutes")}>
            <Input id="f-min" type="number" min={20} max={180} step={5} {...reg("sessionMinutes")} />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink-muted">Injuries or conditions</legend>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {LIMITATION_TAGS.map((t) => (
              <Checkbox key={t} value={t} label={LIMITATION_LABELS[t]} {...reg("limitationTags")} />
            ))}
          </div>
        </fieldset>
        <Field label="Anything else about injuries or limitations" htmlFor="f-lim" error={fieldError(errors, "limitations")}>
          <Textarea id="f-lim" rows={2} placeholder="e.g. Left knee surgery in 2023, fine for walking" {...reg("limitations")} />
        </Field>
        <Field label="Exercise preferences" htmlFor="f-pref" error={fieldError(errors, "exercisePreferences")}>
          <Textarea id="f-pref" rows={2} placeholder="e.g. Enjoys machines, dislikes running" {...reg("exercisePreferences")} />
        </Field>
        <p className="text-[12px] text-ink-subtle">Health details are visible only to this gym&apos;s staff and are used to keep unsuitable exercises out of plans. They are not medical advice.</p>
        <FormError message={formError} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Save profile
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ScreeningDialog({
  memberId,
  current,
  onClose,
  onSaved,
}: {
  memberId: string;
  current: Record<string, unknown> | null;
  onClose: () => void;
  onSaved: (flagged: boolean) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, boolean>>(Object.fromEntries(HEALTH_QUESTIONS.map((q) => [q.key, current?.[q.key] === true])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Health screening"
      description="Physical activity readiness (PAR-Q style). Any “yes” means a trainer should confirm it's safe to train before a plan is created."
      size="lg"
    >
      <div className="space-y-2">
        {HEALTH_QUESTIONS.map((q) => (
          <div key={q.key} className="flex items-center justify-between gap-4 rounded-xl border border-line px-3 py-2.5">
            <span className="text-sm">{q.label}</span>
            <div className="flex shrink-0 gap-1" role="radiogroup" aria-label={q.label}>
              {[false, true].map((v) => (
                <button
                  key={String(v)}
                  role="radio"
                  aria-checked={answers[q.key] === v}
                  onClick={() => setAnswers((a) => ({ ...a, [q.key]: v }))}
                  className={
                    answers[q.key] === v
                      ? v
                        ? "rounded-lg bg-warning/20 px-3 py-1 text-[13px] font-medium text-warning"
                        : "rounded-lg bg-lime-soft px-3 py-1 text-[13px] font-medium text-lime"
                      : "rounded-lg px-3 py-1 text-[13px] text-ink-muted hover:bg-raised"
                  }
                >
                  {v ? "Yes" : "No"}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <FormError message={error} />
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api(`/members/${memberId}/health-screening`, { method: "PUT", body: answers });
              onSaved(Object.values(answers).some(Boolean));
            } catch (err) {
              setError(errorMessage(err));
              setBusy(false);
            }
          }}
        >
          Save answers
        </Button>
      </div>
    </Dialog>
  );
}

function ClearanceDialog({ memberId, onClose, onSaved }: { memberId: string; onClose: () => void; onSaved: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Record clearance" description="Confirm you've checked this member can train (for example, a doctor's note). This is recorded with your name." size="sm">
      <Field label="Clearance note" htmlFor="c-note" required>
        <Input id="c-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Doctor's letter seen on 15 Nov; avoid high impact" />
      </Field>
      <FormError message={error} />
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          loading={busy}
          disabled={!note.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await api(`/members/${memberId}/clearance`, { body: { note } });
              onSaved();
            } catch (err) {
              setError(errorMessage(err));
              setBusy(false);
            }
          }}
        >
          Record clearance
        </Button>
      </div>
    </Dialog>
  );
}
