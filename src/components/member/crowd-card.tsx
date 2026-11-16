"use client";

import { RefreshCw, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ColumnChart } from "@/components/charts/column-chart";
import { Card, CardBody } from "@/components/ui/card";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

export type CrowdData = {
  inside: number;
  capacity: number;
  level: "empty" | "quiet" | "moderate" | "busy" | "very_busy";
  hourNow: number;
  byHour: { hour: number; typical: number; today: number }[];
  busiestHours: number[];
  quietLater: number | null;
  updatedAt: string;
};

const LEVEL: Record<CrowdData["level"], { label: string; tone: string; bar: string }> = {
  empty: { label: "Empty", tone: "bg-lime-soft text-lime", bar: "bg-mint" },
  quiet: { label: "Quiet", tone: "bg-lime-soft text-lime", bar: "bg-mint" },
  moderate: { label: "Moderate", tone: "bg-[#fdf1d8] text-warning", bar: "bg-[#f2b84b]" },
  busy: { label: "Busy", tone: "bg-coral-soft text-[#b4462e]", bar: "bg-coral" },
  very_busy: { label: "Very busy", tone: "bg-coral-soft text-[#b4462e]", bar: "bg-coral" },
};

const hourLabel = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? "am" : "pm"}`;
const shortHour = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? "a" : "p"}`;

/**
 * How busy the gym is right now and on a usual day like today. Counts only,
 * never names. Refreshes every two minutes while the page is open.
 */
export function CrowdCard({ initial, timezone, batch = null }: { initial: CrowdData; timezone: string; batch?: string | null }) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<CrowdData>("/gym/crowd"));
    } catch {
      /* keep the last numbers; the time stamp shows their age */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 120_000);
    return () => clearInterval(t);
  }, [refresh]);

  const level = LEVEL[data.level];
  const pct = Math.min(100, Math.round((data.inside / Math.max(1, data.capacity)) * 100));
  const hasHistory = data.byHour.some((h) => h.typical > 0);
  // In the gym's time zone, so the server and the phone render the same text.
  const updated = new Date(data.updatedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: timezone });

  return (
    <Card data-testid="crowd-card">
      <CardBody className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold">Gym right now</h2>
            <p className="text-[12px] text-ink-subtle">Updated {updated}</p>
            {batch && <p className="text-[12px] text-ink-subtle">Your batch: {batch}</p>}
          </div>
          <div className="flex items-center gap-1.5">
            <span className={cn("rounded-full px-3 py-1 text-[13px] font-semibold", level.tone)} data-testid="crowd-level">
              {level.label}
            </span>
            <button
              type="button"
              onClick={() => void refresh()}
              aria-label="Refresh"
              className="grid size-8 place-items-center rounded-full text-ink-subtle hover:bg-raised hover:text-ink"
            >
              <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            </button>
          </div>
        </div>

        <div>
          <div className="flex items-baseline gap-2">
            <Users className="size-4 self-center text-ink-subtle" aria-hidden />
            <span className="tabular text-[28px] font-semibold leading-none" data-testid="crowd-inside">
              {data.inside}
            </span>
            <span className="text-[13px] text-ink-muted">
              {data.inside === 1 ? "person" : "people"} inside · room for about {data.capacity}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e1ece7]" aria-hidden>
            <div className={cn("h-full rounded-full transition-[width]", level.bar)} style={{ width: `${Math.max(pct, data.inside ? 4 : 0)}%` }} />
          </div>
        </div>

        {hasHistory ? (
          <>
            <ColumnChart
              data={data.byHour.map((h) => ({
                key: String(h.hour),
                label: shortHour(h.hour),
                fullLabel: `${hourLabel(h.hour)}: usually ${h.typical} check-in${h.typical === 1 ? "" : "s"}`,
                value: h.typical,
              }))}
              highlightKey={String(data.hourNow)}
              formatValue={(v) => `${v} usually`}
              formatTick={(v) => String(v)}
              height={150}
              ariaLabel="Usual check-ins per hour on this weekday; the current hour is highlighted"
            />
            <p className="text-[13px] text-ink-muted">
              {data.busiestHours.length > 0 && <>Usually busiest around {data.busiestHours.map(hourLabel).join(" and ")}. </>}
              {data.quietLater !== null && <>Quieter around {hourLabel(data.quietLater)} later today.</>}
            </p>
          </>
        ) : (
          <p className="text-[13px] text-ink-muted">Busy-hour patterns appear after a few weeks of check-ins.</p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-[13px] font-medium">
          <Link href="/me/scan" className="text-lime hover:underline">
            Scan entrance / exit QR
          </Link>
          <Link href="/me/equipment" className="text-lime hover:underline">
            See gym equipment
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
