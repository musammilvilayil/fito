"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

type BarcodeDetectorLike = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
export type CameraState = "off" | "starting" | "on" | "error";

/**
 * Reads QR codes from the device camera: BarcodeDetector where the browser
 * has it, jsQR otherwise. `onDecoded` is called for every decoded frame
 * (callers de-duplicate) with a function that turns the camera off;
 * nothing is decoded while `pausedRef.current`.
 */
export function useQrCamera(onDecoded: (text: string, stop: () => void) => void, pausedRef?: RefObject<boolean>) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camera, setCamera] = useState<CameraState>("off");
  const [cameraError, setCameraError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamera("off");
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCamera("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setCamera("on");
    } catch (err) {
      const name = (err as Error).name;
      setCameraError(
        name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access in the browser settings and try again."
          : name === "NotFoundError"
            ? "No camera found on this device."
            : "Couldn't start the camera. The page must be opened over HTTPS (or localhost).",
      );
      setCamera("error");
    }
  }, []);

  // Decode loop while the camera is on (~6 frames/second).
  useEffect(() => {
    if (camera !== "on") return;
    let stopped = false;
    let detector: BarcodeDetectorLike | null = null;
    let jsQR: typeof import("jsqr").default | null = null;
    const w = window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => BarcodeDetectorLike };
    if (w.BarcodeDetector) {
      try {
        detector = new w.BarcodeDetector({ formats: ["qr_code"] });
      } catch {
        detector = null;
      }
    }
    if (!detector) void import("jsqr").then((m) => (jsQR = m.default));

    const tick = async () => {
      if (stopped) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && !pausedRef?.current) {
        try {
          if (detector) {
            const codes = await detector.detect(video);
            if (codes[0]?.rawValue) onDecoded(codes[0].rawValue, stopCamera);
          } else if (jsQR) {
            const canvas = canvasRef.current!;
            const scale = Math.min(1, 640 / video.videoWidth);
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            const g = canvas.getContext("2d", { willReadFrequently: true })!;
            g.drawImage(video, 0, 0, canvas.width, canvas.height);
            const img = g.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
            if (code?.data) onDecoded(code.data, stopCamera);
          }
        } catch {
          /* keep scanning */
        }
      }
      setTimeout(tick, 160);
    };
    void tick();
    return () => {
      stopped = true;
    };
  }, [camera, onDecoded, pausedRef, stopCamera]);

  useEffect(() => stopCamera, [stopCamera]);

  return { videoRef, canvasRef, camera, cameraError, startCamera, stopCamera };
}

/** The gym door code inside a scanned link (`https://…/s/<code>`), or null. */
export function gymCodeFrom(text: string): string | null {
  const m = /\/s\/([A-Za-z0-9_-]{32,200})\/?(?:[?#].*)?$/.exec(text.trim());
  return m ? m[1]! : null;
}
