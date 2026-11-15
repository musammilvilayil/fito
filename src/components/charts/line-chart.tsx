"use client";

import { Table2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Single-series line chart over time (SVG), following FITO's data-viz rules:
 * 2px line with round joins, a ~10% area wash, an end dot (r=4) with a 2px
 * surface ring, hairline solid gridlines, the latest value as the only direct
 * label, a crosshair that snaps to the nearest point (pointer and arrow keys),
 * a value-first tooltip, and a table view so nothing is hover-only.
 *
 * Colours match the column chart: green #1f9d7a for the series, coral
 * #e8664a for the latest point (validated for the light surface).
 */
export type LinePoint = { date: string; label: string; value: number };

const LINE = "#1f9d7a";
const LATEST = "#e8664a";
const GRID = "#e1e8e5";
const SURFACE = "#ffffff";

function niceRange(min: number, max: number): { lo: number; hi: number; step: number } {
  const span = Math.max(max - min, Math.abs(max) * 0.04, 1);
  const rough = span / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  const lo = Math.floor((min - step * 0.25) / step) * step;
  const hi = Math.ceil((max + step * 0.25) / step) * step;
  return { lo, hi, step };
}

const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

export function LineChart({
  data,
  formatValue,
  ariaLabel,
  height = 220,
  className,
}: {
  data: LinePoint[];
  formatValue: (v: number) => string;
  ariaLabel: string;
  height?: number;
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

  const { lo, hi, step } = niceRange(Math.min(...data.map((d) => d.value)), Math.max(...data.map((d) => d.value)));
  const ticks = useMemo(() => {
    const t: number[] = [];
    for (let v = lo; v <= hi + step / 2; v += step) t.push(Number(v.toFixed(6)));
    return t;
  }, [lo, hi, step]);

  const axisW = Math.max(36, ...ticks.map((t) => formatValue(t).length * 6.4 + 10));
  const endLabelW = formatValue(data[data.length - 1]?.value ?? 0).length * 7 + 14;
  const padTop = 14;
  const padBottom = 26;
  const plotLeft = axisW + 6;
  const plotRight = Math.max(plotLeft + 1, width - endLabelW);
  const plotH = height - padTop - padBottom;
  const d0 = dayNumber(data[0]?.date ?? "1970-01-01");
  const d1 = dayNumber(data[data.length - 1]?.date ?? "1970-01-01");
  const x = (iso: string) => (d1 === d0 ? (plotLeft + plotRight) / 2 : plotLeft + ((dayNumber(iso) - d0) / (d1 - d0)) * (plotRight - plotLeft));
  const y = (v: number) => padTop + plotH - ((v - lo) / (hi - lo)) * plotH;
  const pts = data.map((d) => ({ ...d, px: x(d.date), py: y(d.value) }));
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(" ");
  const area = pts.length ? `${line} L${pts[pts.length - 1]!.px.toFixed(1)},${y(lo)} L${pts[0]!.px.toFixed(1)},${y(lo)} Z` : "";
  const last = pts[pts.length - 1];
  const labelEvery = Math.max(1, Math.ceil(pts.length / Math.max(1, Math.floor((plotRight - plotLeft) / 70))));

  function nearest(clientX: number, rect: DOMRect) {
    const px = clientX - rect.left;
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i]!.px - px) < Math.abs(pts[best]!.px - px)) best = i;
    setActive(best);
  }

  const a = active === null ? null : pts[active];

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
        {width > 0 && pts.length > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={ariaLabel}
            tabIndex={0}
            className="overflow-visible rounded-md outline-none focus-visible:ring-2 focus-visible:ring-lime/40"
            onPointerMove={(e) => nearest(e.clientX, e.currentTarget.getBoundingClientRect())}
            onPointerDown={(e) => nearest(e.clientX, e.currentTarget.getBoundingClientRect())}
            onPointerLeave={() => setActive(null)}
            onBlur={() => setActive(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") setActive((i) => (i === null ? 0 : Math.min(pts.length - 1, i + 1)));
              else if (e.key === "ArrowLeft") setActive((i) => (i === null ? pts.length - 1 : Math.max(0, i - 1)));
              else if (e.key === "Escape") setActive(null);
              else return;
              e.preventDefault();
            }}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={plotLeft} x2={width} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} shapeRendering="crispEdges" />
                <text x={axisW - 4} y={y(t)} dy="0.32em" textAnchor="end" className="tabular fill-ink-subtle text-[11px]">
                  {formatValue(t)}
                </text>
              </g>
            ))}
            {pts.map((p, i) =>
              i % labelEvery === 0 || i === pts.length - 1 ? (
                <text key={p.date} x={p.px} y={height - 8} textAnchor={i === pts.length - 1 && pts.length > 1 ? "end" : "middle"} className="fill-ink-subtle text-[11px]">
                  {p.label}
                </text>
              ) : null,
            )}
            <path d={area} fill={LINE} opacity={0.1} />
            <path d={line} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {a && <line x1={a.px} x2={a.px} y1={padTop} y2={y(lo)} stroke="#b6c4bf" strokeWidth={1} pointerEvents="none" />}
            {a && a !== last && <circle cx={a.px} cy={a.py} r={4} fill={LINE} stroke={SURFACE} strokeWidth={2} />}
            {last && (
              <>
                <circle cx={last.px} cy={last.py} r={4} fill={LATEST} stroke={SURFACE} strokeWidth={2} />
                <text x={last.px + 9} y={last.py} dy="0.32em" className="tabular fill-ink text-[12px] font-semibold">
                  {formatValue(last.value)}
                </text>
              </>
            )}
          </svg>
        )}
        {a && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line-strong bg-overlay px-2.5 py-1.5 shadow-lg"
            style={{ left: Math.min(Math.max(a.px, 70), Math.max(70, width - 70)) }}
            role="status"
          >
            <div className="tabular text-[13px] font-semibold text-ink">{formatValue(a.value)}</div>
            <div className="text-[11.5px] text-ink-muted">{a.label}</div>
          </div>
        )}
      </div>
      {showTable && (
        <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-line">
          <table className="w-full text-[13px]">
            <tbody className="divide-y divide-line">
              {[...data].reverse().map((d) => (
                <tr key={d.date}>
                  <td className="px-3 py-1.5 text-ink-muted">{d.label}</td>
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
