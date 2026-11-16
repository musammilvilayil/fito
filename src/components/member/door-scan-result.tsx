"use client";

import { CheckCircle2, DoorOpen, Loader2, LogOut, XCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/shared/dates";
import { formatINR } from "@/shared/money";

export type DoorScanResult =
  | {
      direction: "in";
      gymName: string;
      status: "checked_in";
      checkInAt: string;
      batchNote: string | null;
      member: { fullName: string; planName: string | null; validUntil: string | null; daysLeft: number | null; duePaise: number };
    }
  | {
      direction: "out";
      gymName: string;
      status: "checked_out" | "already_checked_out";
      checkInAt: string;
      checkOutAt: string;
      minutes: number;
    };

export type DoorScanState = { kind: "busy" } | { kind: "ok"; result: DoorScanResult } | { kind: "error"; code: string; status: number; message: string };

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

function duration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** What a member sees after scanning the gym's entrance or exit code. */
export function DoorScanView({ state, onRetry }: { state: DoorScanState; onRetry?: () => void }) {
  if (state.kind === "busy") {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center" role="status">
        <Loader2 className="size-9 animate-spin text-lime" />
        <p className="text-[15px] text-ink-muted">Checking the code…</p>
      </div>
    );
  }

  if (state.kind === "error") {
    const notMember = state.status === 403 && /not a member/i.test(state.message);
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center" role="alert">
        <span className="grid size-16 place-items-center rounded-full bg-danger/10">
          <XCircle className="size-9 text-danger" />
        </span>
        <h2 className="text-xl font-semibold tracking-tight">
          {state.code === "already_checked_in" ? "Already checked in" : state.code === "not_checked_in" ? "Not checked in yet" : "Couldn't record that"}
        </h2>
        <p className="max-w-sm text-[14px] text-ink-muted">{state.message}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {notMember ? (
            <Button asChild>
              <Link href="/join">Find and join this gym</Link>
            </Button>
          ) : (
            <Button asChild>
              <Link href="/go">Open my FITO</Link>
            </Button>
          )}
          {onRetry && state.status === 0 && (
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      </div>
    );
  }

  const r = state.result;
  if (r.direction === "in") {
    const m = r.member;
    return (
      <div className="flex flex-col items-center gap-2 py-2 text-center" role="status" aria-live="polite">
        <span className="grid size-16 place-items-center rounded-full bg-lime-soft">
          <CheckCircle2 className="size-9 text-lime" />
        </span>
        <p className="mt-1 text-[13px] font-medium uppercase tracking-[0.12em] text-ink-subtle">
          <DoorOpen className="mr-1 inline size-3.5 align-[-2px]" />
          Entrance · {r.gymName}
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">You&apos;re checked in</h2>
        <p className="text-[15px] text-ink-muted">
          Welcome, {m.fullName.split(" ")[0]}. In at <span className="tabular font-medium text-ink">{time(r.checkInAt)}</span>.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2 text-[12.5px]">
          {m.planName && (
            <span className="rounded-full bg-raised px-3 py-1 text-ink-muted">
              {m.planName}
              {m.validUntil ? ` · until ${formatDate(m.validUntil)}` : ""}
            </span>
          )}
          {m.daysLeft !== null && m.daysLeft <= 7 && (
            <span className="rounded-full bg-warning/15 px-3 py-1 font-medium text-warning">
              {m.daysLeft <= 0 ? "Last day today" : `${m.daysLeft} day${m.daysLeft === 1 ? "" : "s"} left`}: renew at the desk
            </span>
          )}
          {m.duePaise > 0 && <span className="rounded-full bg-warning/15 px-3 py-1 font-medium text-warning">{formatINR(m.duePaise)} due</span>}
          {r.batchNote && <span className="rounded-full bg-warning/15 px-3 py-1 font-medium text-warning">{r.batchNote}</span>}
        </div>
        <p className="mt-3 text-[13px] text-ink-subtle">Scan the exit code on your way out.</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/me/workouts">Today&apos;s workout</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/me">Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 py-2 text-center" role="status" aria-live="polite">
      <span className="grid size-16 place-items-center rounded-full bg-lime-soft">
        <LogOut className="size-8 text-lime" />
      </span>
      <p className="mt-1 text-[13px] font-medium uppercase tracking-[0.12em] text-ink-subtle">Exit · {r.gymName}</p>
      <h2 className="text-2xl font-semibold tracking-tight">{r.status === "checked_out" ? "Checked out. Great session!" : "Already checked out"}</h2>
      <p className="text-[15px] text-ink-muted">
        {time(r.checkInAt)} – {time(r.checkOutAt)} · <span className="tabular font-medium text-ink">{duration(r.minutes)}</span> in the gym
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/me/progress">My progress</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/me">Home</Link>
        </Button>
      </div>
    </div>
  );
}
