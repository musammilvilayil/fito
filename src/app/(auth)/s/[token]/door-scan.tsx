"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DoorScanView, type DoorScanResult, type DoorScanState } from "@/components/member/door-scan-result";
import { ApiError, api, errorMessage } from "@/lib/api";

export function DoorScan({ token }: { token: string }) {
  const [state, setState] = useState<DoorScanState>({ kind: "busy" });
  const sent = useRef(false);

  const scan = useCallback(async () => {
    try {
      const result = await api<DoorScanResult>("/attendance/scan", { body: { token } });
      setState({ kind: "ok", result });
      navigator.vibrate?.(60);
    } catch (err) {
      const e = err instanceof ApiError ? err : null;
      setState({ kind: "error", code: e?.code ?? "error", status: e?.status ?? 0, message: errorMessage(err) });
    }
  }, [token]);

  useEffect(() => {
    if (sent.current) return; // once, even in React's development double-run
    sent.current = true;
    void scan();
  }, [scan]);

  return (
    <div className="glass rounded-3xl border p-6 sm:p-8">
      <DoorScanView
        state={state}
        onRetry={() => {
          setState({ kind: "busy" });
          void scan();
        }}
      />
    </div>
  );
}
