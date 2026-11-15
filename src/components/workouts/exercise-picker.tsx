"use client";

import { Loader2, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/form";
import { api } from "@/lib/api";
import { MUSCLES } from "@/shared/schemas/workout";
import type { ExerciseMeta } from "@/shared/workout-rules";

export type LibraryExercise = ExerciseMeta & { images: string[]; instructions: string[]; videoUrl: string | null; custom?: boolean };

/** Searchable exercise library dialog used by the plan editor. */
export function ExercisePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (e: LibraryExercise) => void }) {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("");
  const [items, setItems] = useState<LibraryExercise[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ pageSize: "30", ...(q ? { q } : {}), ...(muscle ? { muscle } : {}) });
      api<{ items: LibraryExercise[] }>(`/exercises?${params}`, { signal: ctrl.signal })
        .then((r) => setItems(r.items))
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, muscle, open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Add exercise" size="lg">
      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
          <Input aria-label="Search exercises" className="pl-9" placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </div>
        <Select aria-label="Muscle" className="w-40" value={muscle} onChange={(e) => setMuscle(e.target.value)}>
          <option value="">All muscles</option>
          {MUSCLES.map((m) => (
            <option key={m} value={m} className="capitalize">
              {m}
            </option>
          ))}
        </Select>
      </div>
      <div className="max-h-[55dvh] overflow-y-auto rounded-xl border border-line">
        {loading && items.length === 0 ? (
          <div className="grid place-items-center py-10">
            <Loader2 className="size-5 animate-spin text-lime" />
          </div>
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">No exercises match.</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((e) => (
              <li key={e.id}>
                <button onClick={() => onPick(e)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-raised">
                  <Thumb src={e.images[0]} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{e.name}</span>
                    <span className="block truncate text-[12px] capitalize text-ink-subtle">
                      {e.primaryMuscles.join(", ")} · {e.equipment} · {e.level}
                    </span>
                  </span>
                  {e.custom && <Badge tone="lime">Gym</Badge>}
                  <Plus className="size-4 text-ink-subtle" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

export function Thumb({ src, size = 44 }: { src?: string; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- external exercise media, sizes vary
    <img src={src} alt="" width={size} height={size} loading="lazy" className="shrink-0 rounded-lg bg-white object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-lg bg-raised text-[10px] text-ink-subtle" style={{ width: size, height: size }}>
      No image
    </span>
  );
}
