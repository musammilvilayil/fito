import { Download, KeyRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FitnessProfileCard } from "@/components/workouts/fitness-profile-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDate, formatDateTime, formatTime } from "@/shared/dates";
import { formatINR } from "@/shared/money";
import { formatPhone } from "@/shared/phone";
import { METHOD_LABELS } from "@/shared/schemas/billing";
import { sequential } from "@/server/db/tx";
import { inGym } from "@/server/auth/context";
import { requireMemberContext } from "@/server/auth/page";
import { memberAttendance } from "@/server/modules/attendance/service";
import { getMember } from "@/server/modules/members/service";
import { memberBilling, selfView } from "@/server/modules/portal/service";

export const metadata: Metadata = { title: "Profile" };

const PHASE: Record<string, { label: string; tone: "success" | "info" | "neutral" | "danger" | "warning" }> = {
  current: { label: "Current", tone: "success" },
  upcoming: { label: "Upcoming", tone: "info" },
  frozen: { label: "Frozen", tone: "info" },
  ended: { label: "Ended", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

export default async function MemberProfilePage() {
  const ctx = await requireMemberContext();
  const [full, billing, visits] = await inGym(ctx, (tx) =>
    sequential(
      () => getMember(tx, ctx, ctx.memberId),
      () => memberBilling(tx, ctx),
      () => memberAttendance(tx, ctx, ctx.memberId, 30),
    ),
  );
  const member = selfView(full);
  const tz = ctx.gym.timezone;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">{member.fullName}</h1>
        <p className="text-sm text-ink-muted">
          {member.memberCode} · member since {formatDate(member.joinedOn)}
        </p>
      </div>

      <Card>
        <CardHeader title="Your details" />
        <CardBody>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <Item label="Phone" value={member.phone ? formatPhone(member.phone) : null} />
            <Item label="Email" value={member.email} />
            <Item label="Date of birth" value={member.dateOfBirth ? formatDate(member.dateOfBirth) : null} />
            <Item label="Trainer" value={member.trainerName} />
            <Item
              label="Emergency contact"
              value={member.emergencyContactName ? `${member.emergencyContactName}${member.emergencyContactPhone ? ` · ${formatPhone(member.emergencyContactPhone)}` : ""}` : null}
            />
          </dl>
          <p className="mt-4 text-[12.5px] text-ink-subtle">To change these details, ask the front desk.</p>
        </CardBody>
      </Card>

      <FitnessProfileCard memberId={member.id} fitness={member.fitness} canEdit canClear={false} selfService />

      <Card>
        <CardHeader title="Memberships" />
        {billing.memberships.length === 0 ? (
          <CardBody className="text-sm text-ink-muted">No memberships yet.</CardBody>
        ) : (
          <ul className="divide-y divide-line">
            {billing.memberships.map((m) => (
              <li key={m.id} className="px-5 py-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">{m.planName}</span>
                  <Badge tone={PHASE[m.phase]?.tone ?? "neutral"}>{PHASE[m.phase]?.label ?? m.phase}</Badge>
                </div>
                <div className="tabular mt-0.5 text-[13px] text-ink-muted">
                  {formatDate(m.startDate)} – {formatDate(m.endDate)} · {formatINR(m.totalPaise)}
                  {m.outstandingPaise > 0 && <span className="text-warning"> · {formatINR(m.outstandingPaise)} due</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Payments & receipts" />
        {billing.payments.length === 0 ? (
          <CardBody className="text-sm text-ink-muted">No payments yet.</CardBody>
        ) : (
          <ul className="divide-y divide-line">
            {billing.payments.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="tabular font-medium">
                    {p.kind === "refund" ? "Refund " : ""}
                    {formatINR(Math.abs(p.amountPaise))}
                    {p.voidedAt && <span className="ml-2 text-[12px] font-normal text-danger">Voided</span>}
                  </div>
                  <div className="text-[12.5px] text-ink-subtle">
                    {formatDateTime(p.paidAt, tz)} · {METHOD_LABELS[p.method]}
                    {p.receiptNumber ? ` · ${p.receiptNumber}` : ""}
                  </div>
                </div>
                {p.receiptNumber && (
                  <a
                    href={`/api/v1/payments/${p.id}/receipt?download=1`}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-lime hover:bg-raised"
                    aria-label={`Download receipt ${p.receiptNumber}`}
                  >
                    <Download className="size-4" /> Receipt
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Attendance" description={`${visits.total} visits in total · ${visits.last30} in the last 30 days`} />
        {visits.visits.length === 0 ? (
          <CardBody className="text-sm text-ink-muted">No visits yet.</CardBody>
        ) : (
          <ul className="max-h-80 divide-y divide-line overflow-y-auto">
            {visits.visits.map((v) => (
              <li key={v.id} className="flex justify-between gap-3 px-5 py-2.5 text-sm">
                <span>{formatDate(v.date)}</span>
                <span className="tabular text-ink-muted">{formatTime(v.checkInAt, tz)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Link href="/account" className="flex items-center gap-2 glass rounded-[var(--radius-card)] border px-5 py-4 text-sm font-medium hover:border-line-strong">
        <KeyRound className="size-4 text-ink-subtle" /> Change password
      </Link>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12.5px] text-ink-subtle">{label}</dt>
      <dd className="truncate">{value ?? "—"}</dd>
    </div>
  );
}
