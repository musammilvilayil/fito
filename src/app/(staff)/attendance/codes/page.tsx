import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page";
import { AccessDenied } from "@/components/ui/states";
import { env } from "@/server/env";
import { hasPermission, inGym } from "@/server/auth/context";
import { requireStaffContext } from "@/server/auth/page";
import { getScanCodes } from "@/server/modules/attendance/self-scan";
import { qrSvg } from "@/server/modules/members/qr";
import { DoorPosters } from "./door-posters";

export const metadata: Metadata = { title: "Entrance & exit QR" };

export default async function DoorCodesPage() {
  const ctx = await requireStaffContext();
  if (!hasPermission(ctx, "attendance.record") && !hasPermission(ctx, "gym.manage")) return <AccessDenied />;
  const codes = await inGym(ctx, (tx) => getScanCodes(tx, ctx));
  const entranceUrl = `${env().APP_URL}/s/${codes.entrance}`;
  const exitUrl = `${env().APP_URL}/s/${codes.exit}`;
  return (
    <>
      <Link href="/attendance" className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Attendance
      </Link>
      <PageHeader
        title="Entrance & exit QR"
        description="Print these and stick them at the door. Members scan the entrance code to check in and the exit code to check out."
      />
      <DoorPosters
        gymName={ctx.gym.name}
        entrance={{ url: entranceUrl, svg: await qrSvg(entranceUrl) }}
        exit={{ url: exitUrl, svg: await qrSvg(exitUrl) }}
        canReplace={hasPermission(ctx, "gym.manage")}
      />
    </>
  );
}
