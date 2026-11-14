"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { cn } from "@/lib/cn";

/** One filter row above the content it scopes: date presets, custom range, method. */
export function RangeFilter({
  from,
  to,
  method,
  today,
  presets,
  methods,
}: {
  from: string;
  to: string;
  method: string;
  today: string;
  presets: { label: string; from: string; to: string }[];
  methods: { value: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [custom, setCustom] = useState({ from, to });
  const go = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const activePreset = presets.find((p) => p.from === from && p.to === to);

  return (
    <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => go({ from: p.from, to: p.to })}
            aria-pressed={activePreset?.label === p.label}
            className={cn(
              "shrink-0 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors",
              activePreset?.label === p.label ? "bg-lime-soft text-lime" : "text-ink-muted hover:bg-raised hover:text-ink",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          go({ from: custom.from, to: custom.to });
        }}
      >
        <Input type="date" aria-label="From" className="h-9 w-[150px]" max={today} value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
        <span className="text-ink-subtle">–</span>
        <Input type="date" aria-label="To" className="h-9 w-[150px]" max={today} value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
        <Button type="submit" size="sm" variant="secondary">
          Apply
        </Button>
        <Select aria-label="Payment method" className="h-9 w-[150px]" value={method} onChange={(e) => go({ method: e.target.value })}>
          <option value="">All methods</option>
          {methods.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </form>
    </div>
  );
}
