"use client";

import { Maximize2, QrCode } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";

/** The member's check-in QR. Served by the API (private, no-store), so it's never cached on shared devices. */
export function CheckInQr({ memberId, memberCode, memberName, canCheckIn }: { memberId: string; memberCode: string; memberName: string; canCheckIn: boolean }) {
  const [big, setBig] = useState(false);
  const src = `/api/v1/members/${memberId}/qr-code`;
  return (
    <Card id="check-in">
      <div className="flex items-center gap-4 p-4">
        <button onClick={() => setBig(true)} className="shrink-0 rounded-xl bg-white p-2" aria-label="Show check-in QR code full size">
          {/* eslint-disable-next-line @next/next/no-img-element -- authenticated SVG from our API */}
          <img src={src} alt={`Check-in QR code for ${memberName}`} width={104} height={104} className="size-[104px]" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[15px] font-semibold">
            <QrCode className="size-4 text-lime" /> Check-in code
          </div>
          <p className="mt-1 text-[13px] text-ink-muted">
            {canCheckIn ? "Show this at the front desk when you arrive." : "Check-in is paused until your membership is renewed."}
          </p>
          <Button variant="secondary" size="sm" className="mt-2.5" onClick={() => setBig(true)}>
            <Maximize2 /> Full screen
          </Button>
        </div>
      </div>
      <Dialog open={big} onOpenChange={setBig} title="Check-in code" description={`${memberName} · ${memberCode}`}>
        <div className="mx-auto w-full max-w-[320px] rounded-2xl bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- authenticated SVG from our API */}
          <img src={src} alt={`Check-in QR code for ${memberName}`} className="aspect-square w-full" />
        </div>
        <p className="mt-4 text-center text-[13px] text-ink-muted">Turn your screen brightness up if the scanner can&apos;t read it.</p>
      </Dialog>
    </Card>
  );
}
