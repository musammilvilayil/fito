import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatPhone } from "@/shared/phone";
import { getSession, homePathFor } from "@/server/auth/page";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const home = await homePathFor();
  return (
    <div className="mx-auto max-w-xl px-4 py-6 sm:py-10">
      <div className="mb-8 flex items-center justify-between">
        <Logo href={home} size="sm" />
        <Link href={home} className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft className="size-4" /> Back
        </Link>
      </div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Your account</h1>
      <Card className="mb-6">
        <CardHeader title="Profile" />
        <CardBody className="space-y-3 text-sm">
          <Row label="Name" value={session.user.fullName} />
          <Row label="Phone" value={session.user.phone ? formatPhone(session.user.phone) : "—"} />
          <Row label="Email" value={session.user.email ?? "—"} />
          <p className="pt-2 text-[12.5px] text-ink-subtle">To change these details, ask your gym owner or front desk.</p>
        </CardBody>
      </Card>
      <ChangePasswordForm />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line pb-3 last:border-0">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
