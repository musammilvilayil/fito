"use client";

import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FormError, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate, parseLooseDate } from "@/shared/dates";
import { formatINR } from "@/shared/money";
import { IMPORT_COLUMNS, type ImportRow } from "@/shared/schemas/member";

type Cell = string | number | boolean | Date | null;
type Sheet = { fileName: string; headers: string[]; rows: Cell[][] };
type Mapping = Partial<Record<keyof ImportRow, number>>;
type RowResult = {
  row: number;
  status: "ready" | "duplicate" | "error";
  fullName: string;
  phone: string | null;
  errors: string[];
  warnings: string[];
  membership: { planName: string; startDate: string; endDate: string; amountPaise: number } | null;
};
type Summary = {
  dryRun: boolean;
  total: number;
  ready: number;
  duplicates: number;
  errors: number;
  created: number;
  membershipsCreated: number;
  rows: RowResult[];
};

const DATE_FIELDS = new Set<keyof ImportRow>(["dateOfBirth", "joinedOn", "membershipStart", "membershipEnd"]);

function normalizeHeader(h: string) {
  return h.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function autoMap(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const normalized = headers.map(normalizeHeader);
  for (const col of IMPORT_COLUMNS) {
    const idx = normalized.findIndex((h) => col.aliases.includes(h));
    if (idx >= 0) mapping[col.key] = idx;
  }
  return mapping;
}

function cellToText(value: Cell, field: keyof ImportRow): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (DATE_FIELDS.has(field)) return parseLooseDate(value) ?? String(value);
  if (value instanceof Date) return parseLooseDate(value);
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(value);
  return String(value).trim();
}

async function readFile(file: File): Promise<Sheet> {
  const name = file.name.toLowerCase();
  let data: Cell[][];
  if (name.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    data = (await readSheet(file)) as unknown as Cell[][];
  } else if (name.endsWith(".csv") || file.type === "text/csv") {
    const Papa = (await import("papaparse")).default;
    const text = await file.text();
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
    data = parsed.data;
  } else {
    throw new Error("Choose a .xlsx or .csv file. Older .xls files: open in Excel and save as .xlsx first.");
  }
  const nonEmpty = data.filter((r) => r.some((c) => c !== null && c !== ""));
  if (nonEmpty.length < 2) throw new Error("The file needs a header row and at least one member.");
  const [header, ...rows] = nonEmpty;
  return { fileName: file.name, headers: header!.map((h, i) => String(h ?? `Column ${i + 1}`).trim()), rows };
}

function downloadTemplate() {
  const header = IMPORT_COLUMNS.map((c) => c.label).join(",");
  const example = "Anjali Nair,98470 12345,anjali@example.com,Female,15/08/1996,01/06/2026,Quarterly,01/09/2026,30/11/2026,3000,";
  const blob = new Blob([`${header}\n${example}\n`], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "fito-members-template.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

export function ImportWizard() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"read" | "check" | "import" | null>(null);
  const [dragging, setDragging] = useState(false);
  const [onlyProblems, setOnlyProblems] = useState(true);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setSummary(null);
    setBusy("read");
    try {
      const s = await readFile(file);
      setSheet(s);
      setMapping(autoMap(s.headers));
    } catch (err) {
      setError(errorMessage(err));
      setSheet(null);
    } finally {
      setBusy(null);
    }
  }

  function buildRows() {
    if (!sheet) return [];
    return sheet.rows.map((r) => {
      const obj: Record<string, string | null> = {};
      for (const col of IMPORT_COLUMNS) {
        const idx = mapping[col.key];
        obj[col.key] = idx === undefined ? null : cellToText(r[idx] ?? null, col.key);
      }
      return obj;
    });
  }

  async function submit(dryRun: boolean) {
    setError(null);
    setBusy(dryRun ? "check" : "import");
    try {
      const result = await api<Summary>("/members/import", { body: { dryRun, rows: buildRows() } });
      setSummary(result);
      if (!dryRun) router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (summary && !summary.dryRun) {
    return (
      <Card>
        <CardBody className="flex flex-col items-center py-12 text-center">
          <CheckCircle2 className="size-10 text-lime" />
          <h2 className="mt-4 text-lg font-semibold">Import complete</h2>
          <p className="mt-2 max-w-md text-sm text-ink-muted">
            Added {summary.created} member{summary.created === 1 ? "" : "s"}
            {summary.membershipsCreated > 0 ? ` and ${summary.membershipsCreated} current membership${summary.membershipsCreated === 1 ? "" : "s"}` : ""}.
            {summary.duplicates > 0 && ` Skipped ${summary.duplicates} already on your register.`}
          </p>
          <div className="mt-6 flex gap-2">
            <Button variant="secondary" onClick={() => { setSheet(null); setSummary(null); }}>
              Import another file
            </Button>
            <Button asChild>
              <Link href="/members">View members</Link>
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {!sheet && (
        <Card>
          <CardBody>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void onFile(e.dataTransfer.files[0]);
              }}
              className={cn(
                "flex flex-col items-center rounded-xl border border-dashed px-6 py-14 text-center transition-colors",
                dragging ? "border-lime bg-lime-soft" : "border-line-strong",
              )}
            >
              <FileSpreadsheet className="size-9 text-lime" />
              <h2 className="mt-4 font-semibold">Drop your Excel or CSV file here</h2>
              <p className="mt-1.5 max-w-md text-[13px] text-ink-muted">
                One member per row with a header row. Columns like Name, Phone, Plan, Start date and Expiry are detected
                automatically.
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                aria-label="Choose file"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <Button onClick={() => inputRef.current?.click()} loading={busy === "read"}>
                  <Upload /> Choose file
                </Button>
                <Button variant="ghost" onClick={downloadTemplate}>
                  <Download /> Download template
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      <FormError message={error} />

      {sheet && (
        <Card>
          <CardHeader
            title="Match your columns"
            description={`${sheet.fileName} · ${sheet.rows.length} row${sheet.rows.length === 1 ? "" : "s"}`}
            action={
              <Button variant="ghost" size="sm" onClick={() => { setSheet(null); setSummary(null); }}>
                Choose another file
              </Button>
            }
          />
          <CardBody className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {IMPORT_COLUMNS.map((col) => (
              <label key={col.key} className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-ink-muted">
                  {col.label}
                  {col.required && <span className="ml-0.5 text-lime">*</span>}
                </span>
                <Select
                  value={mapping[col.key] ?? ""}
                  onChange={(e) => {
                    setSummary(null);
                    setMapping((m) => ({ ...m, [col.key]: e.target.value === "" ? undefined : Number(e.target.value) }));
                  }}
                >
                  <option value="">— Not in file —</option>
                  {sheet.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h}
                    </option>
                  ))}
                </Select>
              </label>
            ))}
          </CardBody>
          <div className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12.5px] text-ink-subtle">
              Dates can be 15/08/2026, 2026-08-15 or Excel dates. Members already on your register (same phone) are skipped.
            </p>
            <Button onClick={() => void submit(true)} loading={busy === "check"} disabled={mapping.fullName === undefined}>
              Check file
            </Button>
          </div>
        </Card>
      )}

      {sheet && summary?.dryRun && (
        <Card>
          <CardHeader
            title="Review before importing"
            description="Rows with errors are skipped. Fix them in your file and import again if needed."
            action={
              <Button onClick={() => void submit(false)} loading={busy === "import"} disabled={summary.ready === 0}>
                Import {summary.ready} member{summary.ready === 1 ? "" : "s"}
              </Button>
            }
          />
          <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
            <SummaryStat label="Ready" value={summary.ready} tone="text-lime" />
            <SummaryStat label="Already registered" value={summary.duplicates} tone="text-info" />
            <SummaryStat label="With errors" value={summary.errors} tone="text-danger" />
          </div>
          <div className="flex items-center justify-between px-5 py-3">
            <label className="flex items-center gap-2 text-[13px] text-ink-muted">
              <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} className="accent-[#b4fc00]" />
              Only show rows with errors or warnings
            </label>
          </div>
          <Table>
            <THead>
              <tr>
                <TH>Row</TH>
                <TH>Member</TH>
                <TH>Membership</TH>
                <TH>Result</TH>
              </tr>
            </THead>
            <TBody>
              {summary.rows
                .filter((r) => !onlyProblems || r.status !== "ready" || r.warnings.length > 0)
                .slice(0, 300)
                .map((r) => (
                  <TR key={r.row}>
                    <TD className="tabular text-ink-subtle">{r.row}</TD>
                    <TD>
                      <div className="font-medium">{r.fullName || <span className="text-ink-subtle">(no name)</span>}</div>
                      {r.phone && <div className="text-[12px] text-ink-subtle">{r.phone}</div>}
                    </TD>
                    <TD className="text-[12.5px] text-ink-muted">
                      {r.membership ? (
                        <>
                          {r.membership.planName}: {formatDate(r.membership.startDate)} – {formatDate(r.membership.endDate)}
                          {r.membership.amountPaise > 0 && ` · ${formatINR(r.membership.amountPaise)} paid`}
                        </>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD>
                      <div className="flex flex-col gap-1">
                        {r.status === "ready" && <Badge tone="success">Ready</Badge>}
                        {r.status === "duplicate" && <Badge tone="info">Skipped: already registered</Badge>}
                        {r.errors.map((e) => (
                          <span key={e} className="flex items-start gap-1.5 text-[12.5px] text-danger">
                            <XCircle className="mt-0.5 size-3.5 shrink-0" /> {e}
                          </span>
                        ))}
                        {r.warnings.map((w) => (
                          <span key={w} className="flex items-start gap-1.5 text-[12.5px] text-warning">
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {w}
                          </span>
                        ))}
                      </div>
                    </TD>
                  </TR>
                ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="px-5 py-4">
      <div className={cn("tabular text-2xl font-semibold", tone)}>{value}</div>
      <div className="mt-0.5 text-[12.5px] text-ink-muted">{label}</div>
    </div>
  );
}
