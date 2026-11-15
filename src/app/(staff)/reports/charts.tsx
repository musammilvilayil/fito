"use client";

import { ColumnChart } from "@/components/charts/column-chart";
import { compactRupees, formatINR } from "@/shared/money";

const monthLabel = (m: string, style: "short" | "long") =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: style === "short" ? "short" : "long", year: style === "short" ? "2-digit" : "numeric", timeZone: "UTC" });

export function RevenueByMonth({ data, current }: { data: { month: string; revenue: number }[]; current: string }) {
  return (
    <ColumnChart
      ariaLabel="Net revenue by month"
      highlightKey={current}
      formatValue={(v) => formatINR(v)}
      formatTick={(v) => (v === 0 ? "0" : compactRupees(v))}
      data={data.map((d) => ({ key: d.month, label: monthLabel(d.month, "short"), fullLabel: monthLabel(d.month, "long"), value: d.revenue }))}
    />
  );
}

export function NewMembersByMonth({ data, current }: { data: { month: string; newMembers: number }[]; current: string }) {
  return (
    <ColumnChart
      ariaLabel="New members by month"
      highlightKey={current}
      formatValue={(v) => `${v} new member${v === 1 ? "" : "s"}`}
      formatTick={(v) => String(v)}
      data={data.map((d) => ({ key: d.month, label: monthLabel(d.month, "short"), fullLabel: monthLabel(d.month, "long"), value: d.newMembers }))}
    />
  );
}

export function DailyCheckIns({ data, today }: { data: { day: string; count: number }[]; today: string }) {
  return (
    <ColumnChart
      ariaLabel="Check-ins per day"
      highlightKey={today}
      formatValue={(v) => `${v} check-in${v === 1 ? "" : "s"}`}
      formatTick={(v) => String(v)}
      data={data.map((d) => {
        const date = new Date(`${d.day}T00:00:00Z`);
        return {
          key: d.day,
          label: date.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }),
          fullLabel: date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }),
          value: d.count,
        };
      })}
    />
  );
}

function hourLabel(h: number) {
  const suffix = h < 12 ? "am" : "pm";
  const n = h % 12 === 0 ? 12 : h % 12;
  return `${n}${suffix}`;
}

export function BusiestHours({ data }: { data: { hour: number; count: number }[] }) {
  // Show the gym's opening span: first to last hour with any check-in (at least 5am–10pm).
  const active = data.filter((d) => d.count > 0).map((d) => d.hour);
  const start = Math.min(5, ...active);
  const end = Math.max(22, ...active);
  return (
    <ColumnChart
      ariaLabel="Check-ins by hour of day"
      formatValue={(v) => `${v} check-in${v === 1 ? "" : "s"}`}
      formatTick={(v) => String(v)}
      data={data
        .filter((d) => d.hour >= start && d.hour <= end)
        .map((d) => ({ key: String(d.hour), label: hourLabel(d.hour), fullLabel: `${hourLabel(d.hour)} – ${hourLabel((d.hour + 1) % 24)}`, value: d.count }))}
    />
  );
}
