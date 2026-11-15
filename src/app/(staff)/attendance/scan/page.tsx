import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page";
import { AccessDenied } from "@/components/ui/states";
import { hasPermission } from "@/server/auth/context";
import { requireStaffContext } from "@/server/auth/page";
import { Scanner } from "./scanner";

export const metadata: Metadata = { title: "Check-in scanner" };

export default async function ScanPage() {
  const ctx = await requireStaffContext();
  if (!hasPermission(ctx, "attendance.record")) return <AccessDenied />;
  return (
    <>
      <Link href="/attendance" className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Attendance
      </Link>
      <PageHeader title="Check-in scanner" description="Scan a member's QR code from their FITO app or printed card." />
      <Scanner canOverride={hasPermission(ctx, "attendance.override")} />
    </>
  );
}
