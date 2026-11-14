"use client";

import { ColumnChart } from "@/components/charts/column-chart";
import { compactRupees, formatINR } from "@/shared/money";

export function CollectionsChart({ data, today }: { data: { day: string; net: number }[]; today: string }) {
  return (
    <ColumnChart
      ariaLabel="Daily net collections"
      highlightKey={today}
      formatValue={(v) => formatINR(v)}
      formatTick={(v) => (v === 0 ? "0" : compactRupees(v))}
      data={data.map((d) => {
        const date = new Date(`${d.day}T00:00:00Z`);
        return {
          key: d.day,
          label: date.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }),
          fullLabel: date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
          value: d.net,
        };
      })}
    />
  );
}
