"use client";

import { Check, ChevronDown, Timer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  Thumb,
  type LibraryExercise,
} from "@/components/workouts/exercise-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { WEEKDAYS, youtubeEmbed, type PlanDay } from "@/shared/schemas/workout";
import { estimateDayMinutes } from "@/shared/workout-rules";

type Entry = { exerciseId: string; done: boolean; weightKg: number | null };
const DIFFICULTY = [
  "Very easy",
  "Easy",
  "Just right",
  "Hard",
  "Very hard",
] as const;

export function WorkoutDay({
  memberId,
  planId,
  days,
  day,
  exercises,
  warmup,
  cooldown,
  notes,
  existing,
}: {
  memberId: string;
  planId: string;
  days: { key: string; title: string; weekday: number | null }[];
  day: PlanDay;
  exercises: Record<string, LibraryExercise>;
  warmup: string;
  cooldown: string;
  notes: string;
  existing: {
    entries: Entry[];
    difficulty: number | null;
    notes: string | null;
  } | null;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState<{ done: boolean; weight: string }[]>(
    () =>
      day.exercises.map((e, i) => {
        const prev =
          existing?.entries[i]?.exerciseId === e.exerciseId
            ? existing.entries[i]
            : existing?.entries.find((x) => x.exerciseId === e.exerciseId);
        return {
          done: prev?.done ?? false,
          weight: prev?.weightKg ? String(prev.weightKg) : "",
        };
      }),
  );
  const [difficulty, setDifficulty] = useState<number | null>(
    existing?.difficulty ?? null,
  );
  const [note, setNote] = useState(existing?.notes ?? "");
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const done = entries.filter((e) => e.done).length;

  const set = (i: number, patch: Partial<{ done: boolean; weight: string }>) =>
    setEntries((all) => all.map((e, j) => (j === i ? { ...e, ...patch } : e)));

  async function save() {
    setSaving(true);
    try {
      await api(`/members/${memberId}/workout-logs`, {
        body: {
          planId,
          dayKey: day.key,
          entries: day.exercises.map((e, i) => ({
            exerciseId: e.exerciseId,
            done: entries[i]!.done,
            weightKg: entries[i]!.weight || null,
          })),
          difficulty,
          notes: note,
        },
      });
      toast.success(
        done === day.exercises.length
          ? "Workout complete. Nice work!"
          : "Workout saved",
      );
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {days.length > 1 && (
        <div
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
          role="tablist"
          aria-label="Workout days"
        >
          {days.map((d) => (
            <button
              key={d.key}
              role="tab"
              aria-selected={d.key === day.key}
              onClick={() =>
                router.push(`/me/workouts?day=${encodeURIComponent(d.key)}`)
              }
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                d.key === day.key
                  ? "border-lime bg-lime text-lime-ink"
                  : "border-line bg-surface text-ink-muted hover:text-ink",
              )}
            >
              {d.weekday !== null ? `${WEEKDAYS[d.weekday]} · ` : ""}
              {d.title}
            </button>
          ))}
        </div>
      )}

      <Card>
        <div className="border-b border-line px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold">{day.title}</h2>
              {day.focus && (
                <p className="text-[13px] text-ink-muted">{day.focus}</p>
              )}
            </div>
            <span className="tabular inline-flex shrink-0 items-center gap-1 text-[12.5px] text-ink-subtle">
              <Timer className="size-3.5" /> ~{estimateDayMinutes(day)} min
            </span>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised"
              role="progressbar"
              aria-valuenow={done}
              aria-valuemin={0}
              aria-valuemax={day.exercises.length}
              aria-label="Exercises done"
            >
              <div
                className="h-full rounded-full bg-lime transition-[width]"
                style={{
                  width: `${(done / Math.max(1, day.exercises.length)) * 100}%`,
                }}
              />
            </div>
            <span className="tabular text-[12.5px] text-ink-muted">
              {done}/{day.exercises.length}
            </span>
          </div>
        </div>

        {warmup && (
          <p className="border-b border-line px-5 py-3 text-[13px] text-ink-muted">
            <span className="font-medium text-ink">Warm-up:</span> {warmup}
          </p>
        )}

        <ol className="divide-y divide-line">
          {day.exercises.map((e, i) => {
            const meta = exercises[e.exerciseId];
            const name = meta?.name ?? e.exerciseId;
            const open = openIdx === i;
            const video = youtubeEmbed(meta?.videoUrl);
            return (
              <li
                key={`${e.exerciseId}-${i}`}
                className={cn(
                  "px-4 py-3 sm:px-5",
                  entries[i]!.done && "bg-lime-soft/40",
                )}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => set(i, { done: !entries[i]!.done })}
                    aria-pressed={entries[i]!.done}
                    aria-label={`Mark ${name} as done`}
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-full border-2 transition-colors",
                      entries[i]!.done
                        ? "border-lime bg-lime text-lime-ink"
                        : "border-line-strong text-transparent hover:border-lime",
                    )}
                  >
                    <Check className="size-5" strokeWidth={3} />
                  </button>
                  <Thumb src={meta?.images[0]} size={48} />
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        "truncate text-sm font-medium",
                        entries[i]!.done &&
                          "text-ink-muted line-through decoration-lime/60",
                      )}
                    >
                      {i + 1}. {name}
                    </div>
                    <div className="tabular text-[13px] text-ink-muted">
                      {e.sets} × {e.reps}{" "}
                      <span className="text-ink-subtle">
                        · rest {e.restSeconds}s
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setOpenIdx(open ? null : i)}
                    aria-expanded={open}
                    aria-label={`How to do ${name}`}
                    className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-subtle hover:bg-raised hover:text-ink"
                  >
                    <ChevronDown
                      className={cn(
                        "size-4 transition-transform",
                        open && "rotate-180",
                      )}
                    />
                  </button>
                </div>
                {e.notes && (
                  <p className="mt-2 pl-[52px] text-[13px] text-ink-muted">
                    Coach: {e.notes}
                  </p>
                )}
                {meta?.category !== "cardio" &&
                  meta?.category !== "stretching" &&
                  !/s|sec|min/i.test(e.reps) && (
                    <label className="mt-2 flex items-center gap-2 pl-[52px] text-[12.5px] text-ink-subtle">
                      Weight used
                      <Input
                        inputMode="decimal"
                        aria-label={`Weight used for ${name} (kg)`}
                        placeholder="—"
                        value={entries[i]!.weight}
                        onChange={(ev) =>
                          set(i, {
                            weight: ev.target.value.replace(/[^0-9.,]/g, ""),
                          })
                        }
                        className="h-8 w-20 text-[13px]"
                      />
                      kg
                    </label>
                  )}
                {open && (
                  <div className="mt-3 space-y-3 pl-[52px]">
                    {video ? (
                      <iframe
                        src={video}
                        title={`${name} demo video`}
                        className="aspect-video w-full rounded-xl"
                        allow="encrypted-media; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      meta &&
                      meta.images.length > 0 && (
                        <div className="grid grid-cols-2 gap-2">
                          {meta.images.slice(0, 2).map((src) => (
                            // eslint-disable-next-line @next/next/no-img-element -- external exercise media
                            <img
                              key={src}
                              src={src}
                              alt={`${name} demonstration`}
                              loading="lazy"
                              className="aspect-[4/3] w-full rounded-lg bg-white object-cover"
                            />
                          ))}
                        </div>
                      )
                    )}
                    {meta && meta.instructions.length > 0 ? (
                      <ol className="list-decimal space-y-1.5 pl-4 text-[13px] leading-relaxed text-ink-muted">
                        {meta.instructions.map((s, k) => (
                          <li key={k}>{s}</li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-[13px] text-ink-muted">
                        Ask your trainer to show you this one.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        {cooldown && (
          <p className="border-t border-line px-5 py-3 text-[13px] text-ink-muted">
            <span className="font-medium text-ink">Cool-down:</span> {cooldown}
          </p>
        )}
        {notes && (
          <p className="border-t border-line px-5 py-3 text-[13px] text-ink-muted">
            <span className="font-medium text-ink">From your trainer:</span>{" "}
            {notes}
          </p>
        )}

        <div className="space-y-4 border-t border-line px-5 py-4">
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium text-ink-muted">
              How hard was it?
            </legend>
            <div
              className="grid grid-cols-5 gap-1.5"
              role="radiogroup"
              aria-label="How hard was it?"
            >
              {DIFFICULTY.map((label, k) => (
                <button
                  key={label}
                  role="radio"
                  aria-checked={difficulty === k + 1}
                  onClick={() =>
                    setDifficulty(difficulty === k + 1 ? null : k + 1)
                  }
                  className={cn(
                    "min-w-0 rounded-lg border px-1 py-2 text-[11.5px] font-medium leading-tight transition-colors",
                    difficulty === k + 1
                      ? "border-lime bg-lime-soft text-ink"
                      : "border-line text-ink-muted hover:text-ink",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <Textarea
            aria-label="Notes for your trainer"
            rows={2}
            placeholder="Notes for your trainer (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            className="w-full"
            size="lg"
            loading={saving}
            onClick={() => void save()}
            disabled={done === 0 && !existing}
          >
            {existing
              ? "Update today's log"
              : done === day.exercises.length
                ? "Finish workout"
                : "Save progress"}
          </Button>
          {done === 0 && !existing && (
            <p className="text-center text-[12.5px] text-ink-subtle">
              Tick off exercises as you go.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
