"use client";

import { LineChart as LineIcon, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { LineChart } from "@/components/charts/line-chart";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Textarea } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/states";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fieldError, useApiForm } from "@/lib/use-api-form";
import { formatDate } from "@/shared/dates";
import { MEASUREMENTS, progressEntrySchema } from "@/shared/schemas/workout";

type Entry = {
  id: string;
  recordedOn: string;
  weightKg: number | null;
  bodyFatPct: number | null;
  measurements: Partial<Record<string, number>>;
  notes: string | null;
  recordedByUserId: string | null;
};

type MetricKey = "weightKg" | "bodyFatPct" | (typeof MEASUREMENTS)[number]["key"];
const METRICS: { key: MetricKey; label: string; unit: string }[] = [
  { key: "weightKg", label: "Weight", unit: "kg" },
  { key: "bodyFatPct", label: "Body fat", unit: "%" },
  ...MEASUREMENTS.map((m) => ({ key: m.key, label: m.label, unit: "cm" })),
];

const valueOf = (e: Entry, k: MetricKey) => (k === "weightKg" ? e.weightKg : k === "bodyFatPct" ? e.bodyFatPct : (e.measurements[k] ?? null));
const fmt = (v: number, unit: string) => `${Number.isInteger(v) ? v : v.toFixed(1)} ${unit}`;
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

export function ProgressView({ memberId, entries, today, selfUserId }: { memberId: string; entries: Entry[]; today: string; selfUserId: string }) {
  const router = useRouter();
  const available = METRICS.filter((m) => entries.some((e) => valueOf(e, m.key) !== null));
  const [metric, setMetric] = useState<MetricKey>(available[0]?.key ?? "weightKg");
  const [adding, setAdding] = useState(false);
  const current = METRICS.find((m) => m.key === metric)!;

  // One point per day (the latest entry that day), oldest first.
  const byDay = new Map<string, number>();
  for (const e of entries) {
    const v = valueOf(e, metric);
    if (v !== null) byDay.set(e.recordedOn, v);
  }
  const points = [...byDay].map(([date, value]) => ({ date, value, label: shortDate(date) }));
  const change = points.length >= 2 ? points[points.length - 1]!.value - points[0]!.value : null;

  async function remove(id: string) {
    try {
      await api(`/progress/${id}`, { method: "DELETE" });
      toast.success("Entry deleted");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="space-y-5">
      <Button className="w-full sm:w-auto" onClick={() => setAdding(true)}>
        <Plus /> Add measurement
      </Button>

      {entries.length === 0 ? (
        <Card>
          <EmptyState icon={LineIcon} title="No measurements yet" description="Add your weight today, then again every week or two to see your trend." />
        </Card>
      ) : (
        <Card>
          <CardHeader
            title={`${current.label} trend`}
            description={
              change === null
                ? "Add another entry to see a trend."
                : `${change === 0 ? "No change" : `${change > 0 ? "+" : "−"}${fmt(Math.abs(change), current.unit)}`} since ${formatDate(points[0]!.date)}`
            }
          />
          <CardBody>
            {available.length > 1 && (
              <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Measurement">
                {available.map((m) => (
                  <button
                    key={m.key}
                    role="tab"
                    aria-selected={m.key === metric}
                    onClick={() => setMetric(m.key)}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1 text-[12.5px] font-medium",
                      m.key === metric ? "border-lime bg-lime-soft text-ink" : "border-line text-ink-muted hover:text-ink",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}
            {points.length >= 2 ? (
              <LineChart data={points} formatValue={(v) => fmt(v, current.unit)} ariaLabel={`${current.label} over time`} />
            ) : (
              <p className="tabular py-6 text-center text-sm text-ink-muted">
                {points[0] ? `${fmt(points[0].value, current.unit)} on ${formatDate(points[0].date)}` : "No entries for this measurement."}
              </p>
            )}
          </CardBody>
        </Card>
      )}

      {entries.length > 0 && (
        <Card>
          <CardHeader title="All entries" />
          <ul className="divide-y divide-line">
            {[...entries].reverse().map((e) => (
              <li key={e.id} className="flex items-start gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{e.recordedOn === today ? "Today" : formatDate(e.recordedOn)}</div>
                  <div className="tabular text-[13px] text-ink-muted">
                    {METRICS.filter((m) => valueOf(e, m.key) !== null)
                      .map((m) => `${m.label} ${fmt(valueOf(e, m.key)!, m.unit)}`)
                      .join(" · ")}
                  </div>
                  {e.notes && <div className="text-[12.5px] text-ink-subtle">{e.notes}</div>}
                  {e.recordedByUserId && e.recordedByUserId !== selfUserId && <div className="text-[12px] text-ink-subtle">Recorded by your trainer</div>}
                </div>
                <Button variant="ghost" size="icon" aria-label={`Delete entry from ${formatDate(e.recordedOn)}`} onClick={() => void remove(e.id)}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {adding && (
        <AddEntry
          memberId={memberId}
          today={today}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            toast.success("Measurement saved");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function AddEntry({ memberId, today, onClose, onSaved }: { memberId: string; today: string; onClose: () => void; onSaved: () => void }) {
  const { form, formError, run, errors, submitting } = useApiForm(progressEntrySchema, {
    recordedOn: today,
    weightKg: "",
    bodyFatPct: "",
    waistCm: "",
    chestCm: "",
    hipsCm: "",
    armCm: "",
    thighCm: "",
    notes: "",
  });
  const reg = form.register;
  const num = (name: MetricKey, label: string, unit: string) => (
    <Field label={`${label} (${unit})`} htmlFor={`pe-${name}`} error={fieldError(errors, name)}>
      <Input id={`pe-${name}`} inputMode="decimal" {...reg(name)} />
    </Field>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Add measurement" description="Fill in what you measured. Everything is optional except one value.">
      <form
        noValidate
        className="space-y-4"
        onSubmit={(ev) => {
          ev.preventDefault();
          void run(async (values) => {
            await api(`/members/${memberId}/progress`, { body: values });
            onSaved();
          });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" htmlFor="pe-date" error={fieldError(errors, "recordedOn")}>
            <Input id="pe-date" type="date" max={today} {...reg("recordedOn")} />
          </Field>
          {num("weightKg", "Weight", "kg")}
          {num("bodyFatPct", "Body fat", "%")}
          {MEASUREMENTS.map((m) => (
            <div key={m.key}>{num(m.key, m.label, "cm")}</div>
          ))}
        </div>
        <Field label="Notes" htmlFor="pe-notes">
          <Textarea id="pe-notes" rows={2} {...reg("notes")} />
        </Field>
        <FormError message={formError} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
