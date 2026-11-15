import { cn } from "@/lib/cn";

/**
 * Progress ring: one value against a goal. The number in the middle and the
 * label beside it carry the value, so the ring itself is decorative.
 */
export function ProgressRing({ value, size = 104, stroke = 10, className }: { value: number; size?: number; stroke?: number; className?: string }) {
  const pct = Math.max(0, Math.min(1, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1f9d7a" />
            <stop offset="100%" stopColor="#10735c" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e1ece7" strokeWidth={stroke} />
        {pct > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="url(#ring-grad)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * pct} ${c}`}
          />
        )}
      </svg>
      <span className="tabular absolute inset-0 grid place-items-center text-[22px] font-semibold text-ink">{Math.round(pct * 100)}%</span>
    </div>
  );
}

export type DayBar = { label: string; date: string; minutes: number; estimated: boolean; isToday: boolean };

/**
 * Minutes at the gym per day this week. Bars are at most 24px wide with a
 * 4px rounded top on one baseline; today's bar is the coral highlight. Each
 * bar has a text equivalent, and the whole chart has a summary label.
 */
export function WeekBars({ days, className }: { days: DayBar[]; className?: string }) {
  const max = Math.max(60, ...days.map((d) => d.minutes));
  const visits = days.filter((d) => d.minutes > 0);
  const summary = visits.length
    ? `This week: ${visits.length} visit${visits.length === 1 ? "" : "s"}, ${visits.map((d) => `${d.label} ${d.minutes} min`).join(", ")}`
    : "No visits yet this week";
  return (
    <div className={cn("flex h-28 items-end justify-between gap-1.5", className)} role="img" aria-label={summary}>
      {days.map((d) => {
        const h = d.minutes > 0 ? Math.max(14, Math.round((d.minutes / max) * 84)) : 6;
        return (
          <div key={d.date} className="flex min-w-0 flex-1 flex-col items-center gap-1.5" title={d.minutes ? `${d.minutes} min${d.estimated ? " (estimated)" : ""}` : "No visit"}>
            <div
              className={cn("w-full max-w-6 rounded-t-[4px]", d.minutes === 0 ? "rounded-b-[4px] bg-[#e1ece7]" : d.isToday ? "bg-coral" : "bg-mint")}
              style={{ height: h }}
            />
            <span className={cn("text-[11px] font-medium", d.isToday ? "text-ink" : "text-ink-subtle")}>{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}
