"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Select } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";

export function TrainerPicker({
  memberId,
  current,
  trainers,
}: {
  memberId: string;
  current: string | null;
  trainers: { id: string; fullName: string; specializations: string[] }[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [saving, setSaving] = useState(false);
  const selected = trainers.find((t) => t.id === value);

  return (
    <div className="space-y-2">
      <Select
        aria-label="Assigned trainer"
        value={value}
        disabled={saving}
        onChange={async (e) => {
          const next = e.target.value;
          const previous = value;
          setValue(next);
          setSaving(true);
          try {
            await api(`/members/${memberId}/trainer`, { body: { trainerId: next || null } });
            toast.success(next ? "Trainer assigned. They've been notified." : "Trainer removed");
            router.refresh();
          } catch (err) {
            setValue(previous);
            toast.error(errorMessage(err));
          } finally {
            setSaving(false);
          }
        }}
      >
        <option value="">Not assigned</option>
        {trainers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.fullName}
          </option>
        ))}
      </Select>
      {selected && selected.specializations.length > 0 && (
        <p className="text-[12px] text-ink-subtle">{selected.specializations.join(" · ")}</p>
      )}
      {trainers.length === 0 && <p className="text-[12px] text-ink-subtle">Invite trainers from Settings → Staff &amp; roles.</p>}
    </div>
  );
}
