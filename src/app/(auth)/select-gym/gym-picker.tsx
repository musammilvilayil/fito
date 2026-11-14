"use client";

import { ChevronRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormError } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";

export function GymPicker({ gyms }: { gyms: { id: string; name: string; role: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      {gyms.map((g) => (
        <button
          key={g.id}
          disabled={busy !== null}
          onClick={async () => {
            setBusy(g.id);
            setError(null);
            try {
              await api("/auth/switch-gym", { body: { gymId: g.id } });
              router.replace("/go");
              router.refresh();
            } catch (err) {
              setError(errorMessage(err));
              setBusy(null);
            }
          }}
          className="flex w-full items-center gap-3 rounded-xl border border-line bg-raised px-4 py-3.5 text-left transition-colors hover:border-lime/50 disabled:opacity-60"
        >
          <span className="grid size-9 place-items-center rounded-lg bg-lime text-sm font-bold text-lime-ink">{g.name.slice(0, 1)}</span>
          <span className="flex-1">
            <span className="block font-medium">{g.name}</span>
            <span className="block text-[12.5px] text-ink-subtle">{g.role}</span>
          </span>
          {busy === g.id ? <Loader2 className="size-4 animate-spin" /> : <ChevronRight className="size-4 text-ink-subtle" />}
        </button>
      ))}
      <FormError message={error} />
    </div>
  );
}
