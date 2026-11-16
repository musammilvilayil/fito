"use client";

import { Camera, CameraOff, CheckCircle2, Keyboard, Loader2, Search, ShieldAlert, XCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { Avatar } from "@/components/ui/page";
import { ApiError, api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useQrCamera } from "@/lib/use-qr-camera";
import { formatDate } from "@/shared/dates";
import { formatINR } from "@/shared/money";
import { formatPhone } from "@/shared/phone";

type Ok = {
  status: "checked_in";
  overridden: boolean;
  batchNote: string | null;
  member: { id: string; fullName: string; memberCode: string; planName: string | null; validUntil: string | null; daysLeft: number | null; duePaise: number };
};
type Outcome =
  | { kind: "ok"; data: Ok; at: number }
  | { kind: "error"; code: string; message: string; member?: { id: string; fullName: string; memberCode: string }; retry?: { qr?: string; memberId?: string }; at: number };

/**
 * Front-desk check-in. Three ways in: the device camera (BarcodeDetector,
 * falling back to jsQR), a handheld USB/Bluetooth scanner (it types into the
 * focused box and presses Enter), or searching the member by name/phone.
 */
export function Scanner({ canOverride }: { canOverride: boolean }) {
  const lastScan = useRef<{ text: string; at: number } | null>(null);
  const busyRef = useRef(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [history, setHistory] = useState<Outcome[]>([]);
  const [busy, setBusy] = useState(false);
  const [wedge, setWedge] = useState("");
  const [query, setQuery] = useState("");
  type Found = { id: string; fullName: string; memberCode: string; phone: string | null };
  // Results remember the query they answer, so a new search never shows the previous person.
  const [results, setResults] = useState<{ q: string; items: Found[] }>({ q: "", items: [] });
  const [overrideReason, setOverrideReason] = useState("");

  const submit = useCallback(async (body: { qr?: string; memberId?: string; overrideReason?: string }) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const data = await api<Ok>("/attendance/check-in", { body });
      const o: Outcome = { kind: "ok", data, at: Date.now() };
      setOutcome(o);
      setHistory((h) => [o, ...h].slice(0, 12));
      navigator.vibrate?.(60);
    } catch (err) {
      const e = err instanceof ApiError ? err : null;
      const details = e?.details as { member?: { id: string; fullName: string; memberCode: string } } | null;
      const o: Outcome = {
        kind: "error",
        code: e?.code ?? "error",
        message: errorMessage(err),
        member: details?.member,
        retry: { qr: body.qr, memberId: body.memberId },
        at: Date.now(),
      };
      setOutcome(o);
      setHistory((h) => [o, ...h].slice(0, 12));
      navigator.vibrate?.([40, 60, 40]);
    } finally {
      busyRef.current = false;
      setBusy(false);
      setOverrideReason("");
    }
  }, []);

  const onDecoded = useCallback(
    (text: string) => {
      const now = Date.now();
      if (lastScan.current && lastScan.current.text === text && now - lastScan.current.at < 4000) return;
      lastScan.current = { text, at: now };
      void submit({ qr: text });
    },
    [submit],
  );
  const { videoRef, canvasRef, camera, cameraError, startCamera, stopCamera } = useQrCamera(onDecoded, busyRef);


  // Clear the big result card after a few seconds so the next person is obvious.
  useEffect(() => {
    if (!outcome) return;
    const t = setTimeout(() => setOutcome((o) => (o === outcome ? null : o)), outcome.kind === "ok" ? 4000 : 9000);
    return () => clearTimeout(t);
  }, [outcome]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api<Found[]>(`/attendance/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((items) => setResults({ q, items }))
        .catch((err) => {
          if ((err as Error).name !== "AbortError") setResults({ q, items: [] });
        });
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  // Only results for exactly what's typed now (stale results are hidden, not cleared in an effect).
  const searching = query.trim().length >= 2 && results.q !== query.trim();
  const shownResults = query.trim().length >= 2 && results.q === query.trim() ? results.items : [];
  const canOverrideThis =
    outcome?.kind === "error" && canOverride && ((outcome.code.startsWith("not_allowed_") && outcome.code !== "not_allowed_inactive") || outcome.code === "outside_batch");

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* Phones: camera, then search by name, then the rest. Desktop: two columns. */}
      <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1">
        <Card className="overflow-hidden">
          <div className="relative aspect-[4/3] w-full bg-black sm:aspect-video">
            <video ref={videoRef} className={cn("h-full w-full object-cover", camera !== "on" && "hidden")} playsInline muted aria-label="Camera preview" />
            <canvas ref={canvasRef} className="hidden" />
            {camera === "on" && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
                <div className="size-[58%] max-h-[70%] rounded-3xl border-2 border-lime/80 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]" style={{ aspectRatio: "1" }} />
              </div>
            )}
            {camera !== "on" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
                {camera === "error" ? <CameraOff className="size-9 text-ink-subtle" /> : <Camera className="size-9 text-lime" />}
                <p className="max-w-sm text-sm text-ink-muted">
                  {cameraError ?? "Point the camera at the member's QR code. FITO checks them in automatically."}
                </p>
                <Button onClick={() => void startCamera()} loading={camera === "starting"}>
                  <Camera /> {camera === "error" ? "Try again" : "Start camera"}
                </Button>
              </div>
            )}
            {outcome && <ResultOverlay outcome={outcome} />}
            {busy && (
              <div className="absolute right-3 top-3 rounded-full bg-black/60 p-2">
                <Loader2 className="size-4 animate-spin text-lime" />
              </div>
            )}
          </div>
          {camera === "on" && (
            <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[12.5px] text-ink-muted">
              <span className="inline-flex items-center gap-2">
                <span className="size-2 animate-pulse rounded-full bg-lime" /> Scanning…
              </span>
              <Button variant="ghost" size="sm" onClick={stopCamera}>
                Stop camera
              </Button>
            </div>
          )}
        </Card>

        {canOverrideThis && outcome?.kind === "error" && (
          <Card>
            <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label htmlFor="override" className="text-[13px] font-medium text-ink-muted">
                  Let {outcome.member?.fullName ?? "them"} in anyway (owner/manager)
                </label>
                <Input id="override" className="mt-1.5" placeholder="Reason, e.g. renewing today" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
              </div>
              <Button
                variant="secondary"
                disabled={!overrideReason.trim() || busy}
                onClick={() => void submit({ ...outcome.retry, overrideReason: overrideReason.trim() })}
              >
                <ShieldAlert /> Check in with override
              </Button>
            </CardBody>
          </Card>
        )}

      </div>

      <div className="min-w-0 space-y-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <Card>
          <CardHeader title="Check in by name" description="No phone or forgot their code? Search instead." />
          <CardBody className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
              <Input aria-label="Search member" className="pl-9" placeholder="Name, phone or member ID" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            {shownResults.length > 0 && (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {shownResults.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Avatar name={r.fullName} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{r.fullName}</div>
                      <div className="truncate text-[12px] text-ink-subtle">
                        {r.memberCode}
                        {r.phone ? ` · ${formatPhone(r.phone)}` : ""}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        void submit({ memberId: r.id });
                        setQuery("");
                      }}
                    >
                      Check in
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {searching && <p className="text-[13px] text-ink-subtle">Searching…</p>}
            {!searching && query.trim().length >= 2 && shownResults.length === 0 && <p className="text-[13px] text-ink-subtle">No active members match.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Handheld scanner" description="Click the box, then scan. Works with USB/Bluetooth QR scanners." />
          <CardBody>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (wedge.trim()) void submit({ qr: wedge.trim() });
                setWedge("");
              }}
            >
              <div className="relative">
                <Keyboard className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
                <Input
                  aria-label="Scanner input"
                  className="pl-9"
                  placeholder="Waiting for scan…"
                  value={wedge}
                  onChange={(e) => setWedge(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </form>
          </CardBody>
        </Card>

      </div>

      <div className="min-w-0 lg:col-start-1 lg:row-start-2">
      <Card>
        <CardHeader title="This session" description="Most recent first" />
        {history.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-muted">No scans yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {history.map((h) => (
              <li key={h.at} className="flex items-center gap-3 px-5 py-3 text-sm">
                {h.kind === "ok" ? <CheckCircle2 className="size-4 shrink-0 text-success" /> : <XCircle className="size-4 shrink-0 text-danger" />}
                <span className="min-w-0 flex-1 truncate">
                  {h.kind === "ok" ? (
                    <Link href={`/members/${h.data.member.id}`} className="font-medium hover:text-lime">
                      {h.data.member.fullName}
                    </Link>
                  ) : (
                    <span className="text-ink-muted">{h.message}</span>
                  )}
                </span>
                <span className="tabular text-[12px] text-ink-subtle">
                  {new Date(h.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      </div>
    </div>
  );
}

function ResultOverlay({ outcome }: { outcome: Outcome }) {
  if (outcome.kind === "ok") {
    const m = outcome.data.member;
    return (
      <div className="absolute inset-x-3 bottom-3 animate-rise rounded-2xl border border-success/40 bg-panel/95 p-4 shadow-2xl" role="status" aria-live="polite">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-8 shrink-0 text-success" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-semibold text-ink">{m.fullName}</div>
            <div className="text-[13px] text-ink-muted">
              Checked in{outcome.data.overridden ? " (override)" : ""} · {m.memberCode}
              {m.planName ? ` · ${m.planName}` : ""}
              {m.validUntil ? ` · until ${formatDate(m.validUntil)}` : ""}
            </div>
          </div>
        </div>
        {(m.daysLeft !== null && m.daysLeft <= 7) || m.duePaise > 0 || outcome.data.batchNote ? (
          <div className="mt-3 flex flex-wrap gap-2 text-[12.5px]">
            {outcome.data.batchNote && <span className="rounded-full bg-warning/15 px-2.5 py-1 font-medium text-warning">{outcome.data.batchNote}</span>}
            {m.daysLeft !== null && m.daysLeft <= 7 && (
              <span className="rounded-full bg-warning/15 px-2.5 py-1 font-medium text-warning">
                {m.daysLeft <= 0 ? "Last day today" : `${m.daysLeft} day${m.daysLeft === 1 ? "" : "s"} left`}: remind to renew
              </span>
            )}
            {m.duePaise > 0 && <span className="rounded-full bg-warning/15 px-2.5 py-1 font-medium text-warning">{formatINR(m.duePaise)} due</span>}
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className="absolute inset-x-3 bottom-3 animate-rise rounded-2xl border border-danger/40 bg-panel/95 p-4 shadow-2xl" role="alert">
      <div className="flex items-center gap-3">
        <XCircle className="size-8 shrink-0 text-danger" />
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-ink">{outcome.member ? `${outcome.member.fullName}: not checked in` : "Not checked in"}</div>
          <div className="text-[13px] text-ink-muted">{outcome.message}</div>
        </div>
      </div>
      {outcome.member && (
        <Link href={`/members/${outcome.member.id}`} className="mt-3 inline-block text-[13px] font-medium text-lime hover:underline">
          Open profile to renew →
        </Link>
      )}
    </div>
  );
}
