"use client";

import { Camera, CameraOff } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { DoorScanView, type DoorScanResult, type DoorScanState } from "@/components/member/door-scan-result";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { ApiError, api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { gymCodeFrom, useQrCamera } from "@/lib/use-qr-camera";

/**
 * The member's own scanner for the codes posted at the gym's entrance and
 * exit. (A phone's normal camera app works too: the code is a link.)
 */
export function MemberScanner() {
  const [state, setState] = useState<DoorScanState | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const busyRef = useRef(false);
  const last = useRef<{ text: string; at: number } | null>(null);

  const onDecoded = useCallback((text: string, stop: () => void) => {
    const now = Date.now();
    if (last.current && last.current.text === text && now - last.current.at < 5000) return;
    last.current = { text, at: now };
    const token = gymCodeFrom(text);
    if (!token) {
      setHint("That isn't a gym entrance or exit code. Your own check-in QR is for the front desk to scan.");
      return;
    }
    setHint(null);
    busyRef.current = true;
    setState({ kind: "busy" });
    stop();
    api<DoorScanResult>("/attendance/scan", { body: { token } })
      .then((result) => {
        setState({ kind: "ok", result });
        navigator.vibrate?.(60);
      })
      .catch((err) => {
        const e = err instanceof ApiError ? err : null;
        setState({
          kind: "error",
          code: e?.code ?? "error",
          status: e?.status ?? 0,
          message: errorMessage(err),
        });
      })
      .finally(() => {
        busyRef.current = false;
      });
  }, []);

  const { videoRef, canvasRef, camera, cameraError, startCamera, stopCamera } = useQrCamera(onDecoded, busyRef);

  // The camera card stays mounted (hidden) under a result, so "scan another" can restart it at once.
  const result = state && (
    <Card>
      <CardBody>
        <DoorScanView state={state} />
        {state.kind !== "busy" && (
          <div className="mt-4 text-center">
            <Button
              variant="ghost"
              onClick={() => {
                setState(null);
                last.current = null;
                void startCamera();
              }}
            >
              <Camera /> Scan another code
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );

  return (
    <>
      {result}
      <Card className={cn("overflow-hidden", state && "hidden")}>
        <div className="relative aspect-[3/4] w-full bg-black sm:aspect-video">
          <video ref={videoRef} className={cn("h-full w-full object-cover", camera !== "on" && "hidden")} playsInline muted aria-label="Camera preview" />
          <canvas ref={canvasRef} className="hidden" />
          {camera === "on" && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
              <div className="aspect-square w-[64%] max-w-[300px] rounded-3xl border-2 border-white/90 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]" />
            </div>
          )}
          {camera !== "on" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[radial-gradient(circle_at_50%_30%,#20453c,#0d1d19)] p-6 text-center">
              {camera === "error" ? <CameraOff className="size-9 text-white/70" /> : <Camera className="size-9 text-white" />}
              <p className="max-w-xs text-sm text-white/80">{cameraError ?? "Point your camera at the QR poster at the gym's entrance or exit."}</p>
              <Button onClick={() => void startCamera()} loading={camera === "starting"}>
                <Camera /> {camera === "error" ? "Try again" : "Open camera"}
              </Button>
            </div>
          )}
          {hint && (
            <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-panel/95 p-3 text-[13px] text-ink shadow-xl" role="status">
              {hint}
            </div>
          )}
        </div>
        {camera === "on" && (
          <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[12.5px] text-ink-muted">
            <span className="inline-flex items-center gap-2">
              <span className="size-2 animate-pulse rounded-full bg-lime" /> Looking for a code…
            </span>
            <Button variant="ghost" size="sm" onClick={stopCamera}>
              Stop
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
