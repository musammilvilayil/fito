"use client";

import { Table2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Single-series column chart (SVG). Specs follow FITO's data-viz rules:
 * bars <= 24px with a 4px rounded top and square baseline, hairline solid
 * gridlines, values in text colours (never the bar colour), a hover/keyboard
 * tooltip per bar, and a table view so no value is hover-only.
 *
 * Chart fill #73a300 is a deeper step of the brand lime that passes the
 * dark-surface lightness/contrast checks; the brand lime (#b4fc00) marks the
 * highlighted (current) bar only.
 */
export type ColumnDatum = { key: string; label: string; fullLabel: string; value: number };

const FILL = "#73a300";
const FILL_HOVER = "#86bb0a";
const HIGHLIGHT = "#b4fc00";
const GRID = "#2e343c";

function niceMax(max: number): { top: number; step: number } {
  if (max <= 0) return { top: 4, step: 1 };
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  return { top: Math.ceil(max / step) * step, step };
}

export function ColumnChart({
  data,
  formatValue,
  formatTick,
  height = 220,
  highlightKey,
  ariaLabel,
  className,
}: {
  data: ColumnDatum[];
  formatValue: (v: number) => string;
  formatTick?: (v: number) => string;
  height?: number;
  highlightKey?: string;
  ariaLabel: string;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const max = Math.max(0, ...data.map((d) => d.value));
  const { top, step } = niceMax(max);
  const ticks = useMemo(() => {
    const t: number[] = [];
    for (let v = 0; v <= top + step / 2; v += step) t.push(v);
    return t;
  }, [top, step]);
  const tickFmt = formatTick ?? formatValue;
  const axisW = Math.max(36, ...ticks.map((t) => tickFmt(t).length * 6.4 + 10));
  const padTop = 12;
  const padBottom = 26;
  const plotW = Math.max(0, width - axisW);
  const plotH = height - padTop - padBottom;
  const band = data.length > 0 ? plotW / data.length : 0;
  const barW = Math.max(2, Math.min(24, band - 2, band * 0.62));
  const y = (v: number) => padTop + plotH - (v / top) * plotH;
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotW / 44))));

  const activeDatum = active === null ? null : data[active];
  const tooltipLeft = active === null ? 0 : axisW + band * active + band / 2;

  return (
    <div className={cn("relative", className)}>
      <div className="mb-2 flex justify-end">
        <button
          onClick={() => setShowTable((s) => !s)}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-ink-subtle hover:bg-raised hover:text-ink"
          aria-pressed={showTable}
        >
          <Table2 className="size-3.5" /> {showTable ? "Hide table" : "Table view"}
        </button>
      </div>
      <div ref={wrapRef} className="relative" style={{ height }}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={ariaLabel}
            tabIndex={0}
            className="overflow-visible outline-none focus-visible:ring-2 focus-visible:ring-lime/40 rounded-md"
            onKeyDown={(e) => {
              if (data.length === 0) return;
              if (e.key === "ArrowRight") setActive((a) => (a === null ? 0 : Math.min(data.length - 1, a + 1)));
              else if (e.key === "ArrowLeft") setActive((a) => (a === null ? data.length - 1 : Math.max(0, a - 1)));
              else if (e.key === "Escape") setActive(null);
              else return;
              e.preventDefault();
            }}
            onBlur={() => setActive(null)}
            onPointerLeave={() => setActive(null)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={axisW} x2={width} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} shapeRendering="crispEdges" />
                <text x={axisW - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-subtle text-[11px] tabular">
                  {tickFmt(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = axisW + band * i + band / 2;
              const x = cx - barW / 2;
              const h = Math.max(0, y(0) - y(d.value));
              const r = Math.min(4, barW / 2, h);
              const fill = d.key === highlightKey ? HIGHLIGHT : active === i ? FILL_HOVER : FILL;
              const yTop = y(0) - h;
              const path =
                h <= 0
                  ? ""
                  : `M${x},${y(0)} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${y(0)} Z`;
              return (
                <g key={d.key}>
                  {path && <path d={path} fill={fill} />}
                  {i % labelEvery === 0 && (
                    <text x={cx} y={height - 8} textAnchor="middle" className="fill-ink-subtle text-[11px]">
                      {d.label}
                    </text>
                  )}
                  {/* Hit target: the whole band, taller than the bar. */}
                  <rect x={axisW + band * i} y={padTop} width={band} height={plotH} fill="transparent" onPointerMove={() => setActive(i)} />
                </g>
              );
            })}
            {active !== null && <line x1={tooltipLeft} x2={tooltipLeft} y1={padTop} y2={y(0)} stroke={GRID} strokeWidth={1} pointerEvents="none" />}
          </svg>
        )}
        {activeDatum && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line-strong bg-overlay px-2.5 py-1.5 shadow-lg"
            style={{ left: Math.min(Math.max(tooltipLeft, 70), Math.max(70, width - 70)) }}
            role="status"
          >
            <div className="tabular text-[13px] font-semibold text-ink">{formatValue(activeDatum.value)}</div>
            <div className="text-[11.5px] text-ink-muted">{activeDatum.fullLabel}</div>
          </div>
        )}
      </div>
      {showTable && (
        <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-line">
          <table className="w-full text-[13px]">
            <tbody className="divide-y divide-line">
              {data.map((d) => (
                <tr key={d.key}>
                  <td className="px-3 py-1.5 text-ink-muted">{d.fullLabel}</td>
                  <td className="tabular px-3 py-1.5 text-right text-ink">{formatValue(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
