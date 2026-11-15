"use client";

import { Dumbbell, Loader2, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Thumb, type LibraryExercise } from "@/components/workouts/exercise-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/states";
import { api, errorMessage } from "@/lib/api";
import { fieldError, useApiForm } from "@/lib/use-api-form";
import { customExerciseSchema, MUSCLES, youtubeEmbed } from "@/shared/schemas/workout";

type Page = { items: (LibraryExercise & { custom: boolean; mechanic: string | null })[]; total: number; page: number; pageSize: number };

export function ExerciseLibrary({ equipment, canCreate }: { equipment: string[]; canCreate: boolean }) {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("");
  const [equip, setEquip] = useState("");
  const [level, setLevel] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Page["items"][number] | null>(null);
  const [creating, setCreating] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), pageSize: "24" });
      if (q) params.set("q", q);
      if (muscle) params.set("muscle", muscle);
      if (equip) params.set("equipment", equip);
      if (level) params.set("level", level);
      api<Page>(`/exercises?${params}`, { signal: ctrl.signal })
        .then((d) => {
          setData(d);
          setError(null);
        })
        .catch((err) => {
          if ((err as Error).name !== "AbortError") setError(errorMessage(err));
        })
        .finally(() => setLoading(false));
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, muscle, equip, level, page, reload]);

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
          <Input aria-label="Search exercises" className="pl-9" placeholder="Search exercises" value={q} onChange={(e) => reset(setQ)(e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-2 lg:flex">
          <Select aria-label="Muscle" value={muscle} onChange={(e) => reset(setMuscle)(e.target.value)} className="lg:w-40">
            <option value="">All muscles</option>
            {MUSCLES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
          <Select aria-label="Equipment" value={equip} onChange={(e) => reset(setEquip)(e.target.value)} className="lg:w-40">
            <option value="">All equipment</option>
            {equipment.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
          <Select aria-label="Level" value={level} onChange={(e) => reset(setLevel)(e.target.value)} className="lg:w-36">
            <option value="">All levels</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="expert">Expert</option>
          </Select>
        </div>
        {canCreate && (
          <Button onClick={() => setCreating(true)}>
            <Plus /> Add gym exercise
          </Button>
        )}
      </div>

      <FormError message={error} />

      {data && data.items.length === 0 && !loading ? (
        <Card>
          <EmptyState icon={Dumbbell} title="No exercises match" description="Try fewer filters." />
        </Card>
      ) : (
        <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          {(data?.items ?? []).map((e) => (
            <button
              key={e.id}
              onClick={() => setOpen(e)}
              className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-3 text-left transition-colors hover:border-line-strong"
            >
              <Thumb src={e.images[0]} size={64} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{e.name}</span>
                <span className="mt-0.5 block truncate text-[12.5px] capitalize text-ink-subtle">{e.primaryMuscles.join(", ")}</span>
                <span className="mt-1.5 flex flex-wrap gap-1">
                  <Badge>{e.equipment}</Badge>
                  <Badge>{e.level}</Badge>
                  {e.custom && <Badge tone="lime">Gym</Badge>}
                </span>
              </span>
            </button>
          ))}
          {!data && loading && (
            <div className="col-span-full grid place-items-center py-16">
              <Loader2 className="size-6 animate-spin text-lime" />
            </div>
          )}
        </div>
      )}

      {data && pages > 1 && (
        <div className="mt-5 flex items-center justify-between text-[13px] text-ink-muted">
          <span className="tabular">
            Page {data.page} of {pages} · {data.total} exercises
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {open && <ExerciseDetail exercise={open} onClose={() => setOpen(null)} />}
      {creating && (
        <CreateExercise
          equipment={equipment}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            toast.success("Exercise added to your gym's library");
            setReload((r) => r + 1);
          }}
        />
      )}
    </>
  );
}

function ExerciseDetail({ exercise: e, onClose }: { exercise: LibraryExercise & { mechanic: string | null }; onClose: () => void }) {
  const video = youtubeEmbed(e.videoUrl);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={e.name} description={`${e.primaryMuscles.join(", ")} · ${e.equipment} · ${e.level}`} size="lg">
      {video ? (
        <iframe src={video} title={`${e.name} demo video`} className="mb-4 aspect-video w-full rounded-xl" allow="encrypted-media; picture-in-picture" allowFullScreen />
      ) : e.images.length > 0 ? (
        <div className="mb-4 grid grid-cols-2 gap-2">
          {e.images.slice(0, 2).map((src) => (
            // eslint-disable-next-line @next/next/no-img-element -- external exercise media
            <img key={src} src={src} alt={`${e.name} demonstration`} className="aspect-[4/3] w-full rounded-xl bg-white object-cover" />
          ))}
        </div>
      ) : null}
      {e.instructions.length > 0 ? (
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-ink-muted">
          {e.instructions.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-ink-muted">No instructions yet.</p>
      )}
      {e.riskTags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {e.riskTags.map((t) => (
            <Badge key={t} tone="warning">
              {t.replace(/_/g, " ")}
            </Badge>
          ))}
        </div>
      )}
    </Dialog>
  );
}

function CreateExercise({ equipment, onClose, onCreated }: { equipment: string[]; onClose: () => void; onCreated: () => void }) {
  const { form, formError, run, errors, submitting } = useApiForm(customExerciseSchema, {
    name: "",
    category: "strength",
    equipment: equipment.includes("machine") ? "machine" : (equipment[0] ?? "body only"),
    level: "beginner",
    primaryMuscles: [],
    instructions: "",
    videoUrl: "",
  });
  const reg = form.register;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Add a gym exercise" description="For machines or movements specific to your gym. Visible only to your gym." size="lg">
      <form
        noValidate
        className="space-y-4"
        onSubmit={(ev) => {
          ev.preventDefault();
          void run(async (values) => {
            await api("/exercises", { body: values });
            onCreated();
          });
        }}
      >
        <Field label="Name" htmlFor="ce-name" required error={fieldError(errors, "name")}>
          <Input id="ce-name" placeholder="Hammer Strength Chest Press" {...reg("name")} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Type" htmlFor="ce-cat">
            <Select id="ce-cat" {...reg("category")}>
              <option value="strength">Strength</option>
              <option value="cardio">Cardio</option>
              <option value="stretching">Stretching</option>
              <option value="plyometrics">Plyometrics</option>
            </Select>
          </Field>
          <Field label="Equipment" htmlFor="ce-eq" error={fieldError(errors, "equipment")}>
            <Input id="ce-eq" list="ce-eq-list" {...reg("equipment")} />
            <datalist id="ce-eq-list">
              {equipment.map((e) => (
                <option key={e} value={e} />
              ))}
            </datalist>
          </Field>
          <Field label="Level" htmlFor="ce-level">
            <Select id="ce-level" {...reg("level")}>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="expert">Expert</option>
            </Select>
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink-muted">Main muscles worked</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {MUSCLES.map((m) => (
              <Checkbox key={m} value={m} label={<span className="capitalize">{m}</span>} {...reg("primaryMuscles")} />
            ))}
          </div>
          {fieldError(errors, "primaryMuscles") && <p className="mt-1 text-[12px] text-danger">{fieldError(errors, "primaryMuscles")}</p>}
        </fieldset>
        <Field label="Instructions" htmlFor="ce-ins" hint="One step per line">
          <Textarea id="ce-ins" rows={4} {...reg("instructions")} />
        </Field>
        <Field label="Demo video (YouTube)" htmlFor="ce-vid" error={fieldError(errors, "videoUrl")}>
          <Input id="ce-vid" placeholder="https://youtu.be/…" {...reg("videoUrl")} />
        </Field>
        <FormError message={formError} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Add exercise
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
