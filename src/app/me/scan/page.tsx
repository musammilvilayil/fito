import type { Metadata } from "next";
import { MemberScanner } from "./member-scanner";

export const metadata: Metadata = { title: "Scan gym QR" };

export default function MemberScanPage() {
  return (
    <div className="space-y-4">
      <div className="px-1">
        <h1 className="text-[24px] font-semibold tracking-tight">Scan the gym QR</h1>
        <p className="text-sm text-ink-muted">Entrance code to check in, exit code to check out.</p>
      </div>
      <MemberScanner />
    </div>
  );
}
