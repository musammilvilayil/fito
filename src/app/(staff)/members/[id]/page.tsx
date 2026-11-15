import { ArrowLeft, CalendarDays, Mail, MapPin, Phone, ShieldAlert, User } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { StandingBadge } from "@/components/members/standing-badge";
import { renewalReminder, WhatsAppButton } from "@/components/members/whatsapp-button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/page";
import { formatDate, diffDays } from "@/shared/dates";
import { formatPhone } from "@/shared/phone";
import { GENDER_LABELS } from "@/shared/schemas/member";
import { hasPermission, inGym } from "@/server/auth/context";
import { requireStaffContext } from "@/server/auth/page";
import { renewalStart } from "@/shared/membership";
import { listMemberMemberships, listMemberPayments } from "@/server/modules/memberships/service";
import { getMember, gymToday } from "@/server/modules/members/service";
import { listPlans } from "@/server/modules/plans/service";
import { MemberBilling } from "./billing/member-billing";
import { listTrainers } from "@/server/modules/staff/service";
import { MemberActions } from "./member-actions";
import { TrainerPicker } from "./trainer-picker";
import { memberAttendance } from "@/server/modules/attendance/service";
import { formatTime } from "@/shared/dates";
import { QrCard } from "./qr-card";
import { FitnessProfileCard } from "@/components/workouts/fitness-profile-card";
import { PlanSourceBadge, PlanStatusBadge } from "@/components/workouts/plan-badges";
import { memberPlans } from "@/server/modules/workouts/service";
import { ClipboardList, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sequential } from "@/server/db/tx";

export const metadata: Metadata = { title: "Member" };

export default async function MemberPage({ params }: PageProps<"/members/[id]">) {
  const { id } = await params;
  const ctx = await requireStaffContext();
  const canBilling = hasPermission(ctx, "payments.view") || hasPermission(ctx, "memberships.manage");
  const canAttendance = hasPermission(ctx, "attendance.view") || hasPermission(ctx, "attendance.record");
  const canQr = hasPermission(ctx, "members.manage") || hasPermission(ctx, "attendance.record");
  const canCoach = hasPermission(ctx, "workouts.manage");
  const [member, trainers, billing, visits, plans] = await inGym(ctx, (tx) =>
    sequential(
      () => getMember(tx, ctx, id),
      () => listTrainers(tx, ctx),
      () =>
        canBilling
          ? sequential(
              () => listMemberMemberships(tx, ctx, id),
              () => listMemberPayments(tx, ctx, id).catch(() => []),
              () => listPlans(tx, ctx),
            )
          : Promise.resolve(null),
      () => (canAttendance ? memberAttendance(tx, ctx, id, 8) : Promise.resolve(null)),
      () => (canCoach ? memberPlans(tx, ctx, id) : Promise.resolve(null)),
    ),
  );
  const today = gymToday(ctx);
  const canManage = hasPermission(ctx, "members.manage");
  const daysLeft = member.current ? diffDays(today, member.current.validUntil) : null;

  return (
    <>
      <Link href="/members" className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Members
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={member.fullName} size={56} />
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-semibold tracking-tight sm:text-[26px]">{member.fullName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
              <span className="font-mono text-[12.5px]">{member.memberCode}</span>
              <span aria-hidden>·</span>
              <StandingBadge standing={member.standing} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(member.standing === "expiring" || member.standing === "expired") && (
            <WhatsAppButton phone={member.phone} label="Renewal reminder" message={renewalReminder(member.fullName, ctx.gym.name, member.current?.validUntil ?? null)} />
          )}
          {canManage && (
            <MemberActions
              memberId={member.id}
              fullName={member.fullName}
              phone={member.phone}
              status={member.status}
              hasAccount={member.hasAccount}
              gymName={ctx.gym.name}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Membership" />
            <CardBody>
              {member.current ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Stat label="Plan" value={member.current.planName} />
                  <Stat label="Started" value={formatDate(member.current.startDate)} />
                  <Stat
                    label="Valid until"
                    value={formatDate(member.current.validUntil)}
                    hint={
                      daysLeft === null
                        ? undefined
                        : daysLeft >= 0
                          ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
                          : `Expired ${-daysLeft} day${daysLeft === -1 ? "" : "s"} ago`
                    }
                  />
                </div>
              ) : (
                <p className="text-sm text-ink-muted">No membership on record yet.</p>
              )}
            </CardBody>
          </Card>

          {billing && (
            <MemberBilling
              memberId={member.id}
              memberName={member.fullName}
              memberActive={member.status === "active"}
              today={today}
              suggestedStart={renewalStart(member.current?.validUntil ?? null, today)}
              perms={{
                sell: hasPermission(ctx, "memberships.manage"),
                record: hasPermission(ctx, "payments.record"),
                void: hasPermission(ctx, "payments.void"),
              }}
              memberships={billing[0].map((m) => ({
                id: m.id,
                planName: m.planName,
                durationUnit: m.durationUnit,
                durationValue: m.durationValue,
                kind: m.kind,
                startDate: m.startDate,
                endDate: m.endDate,
                totalPaise: m.totalPaise,
                discountPaise: m.discountPaise,
                paidPaise: m.paidPaise,
                outstandingPaise: m.outstandingPaise,
                phase: m.phase as never,
                frozenSince: m.frozenSince,
                cancelReason: m.cancelReason,
              }))}
              payments={billing[1].map((p) => ({
                id: p.id,
                kind: p.kind,
                amountPaise: p.amountPaise,
                method: p.method,
                status: p.status,
                paidAt: p.paidAt.toISOString(),
                receiptNumber: p.receiptNumber,
                reference: p.reference,
                notes: p.notes,
                membershipId: p.membershipId,
                refundOfId: p.refundOfId,
              }))}
              plans={billing[2].map((p) => ({
                id: p.id,
                name: p.name,
                durationUnit: p.durationUnit,
                durationValue: p.durationValue,
                pricePaise: p.pricePaise,
                admissionFeePaise: p.admissionFeePaise,
              }))}
            />
          )}

          {(canCoach || canManage) && (
            <FitnessProfileCard
              memberId={member.id}
              fitness={member.fitness}
              canEdit={canCoach || canManage}
              canClear={hasPermission(ctx, "workouts.approve")}
            />
          )}

          {plans && (
            <Card>
              <CardHeader
                title="Workout plans"
                action={
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/workouts/new?member=${member.id}`}>
                      <Plus /> New plan
                    </Link>
                  </Button>
                }
              />
              {plans.length === 0 ? (
                <div className="flex items-center gap-3 px-5 py-5 text-sm text-ink-muted">
                  <ClipboardList className="size-4 text-ink-subtle" /> No workout plan yet.
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {plans.map((p) => (
                    <li key={p.id}>
                      <Link href={`/workouts/${p.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-raised/60">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                        <PlanSourceBadge source={p.source} />
                        <PlanStatusBadge status={p.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card>
            <CardHeader title="Details" />
            <CardBody className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <Detail icon={Phone} label="Phone" value={member.phone ? formatPhone(member.phone) : null} />
              <Detail icon={Mail} label="Email" value={member.email} />
              <Detail icon={User} label="Gender" value={member.gender ? GENDER_LABELS[member.gender as keyof typeof GENDER_LABELS] : null} />
              <Detail icon={CalendarDays} label="Date of birth" value={member.dateOfBirth ? formatDate(member.dateOfBirth) : null} />
              <Detail icon={CalendarDays} label="Joined" value={formatDate(member.joinedOn)} />
              <Detail icon={MapPin} label="Address" value={member.address} />
              <Detail
                icon={ShieldAlert}
                label="Emergency contact"
                value={
                  member.emergencyContactName || member.emergencyContactPhone
                    ? [member.emergencyContactName, member.emergencyContactPhone ? formatPhone(member.emergencyContactPhone) : null]
                        .filter(Boolean)
                        .join(" · ")
                    : null
                }
              />
            </CardBody>
          </Card>

          {member.notes && (
            <Card>
              <CardHeader title="Notes" />
              <CardBody className="whitespace-pre-wrap text-sm text-ink-muted">{member.notes}</CardBody>
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Trainer" />
            <CardBody>
              {hasPermission(ctx, "members.assign_trainer") ? (
                <TrainerPicker memberId={member.id} current={member.assignedTrainerId} trainers={trainers} />
              ) : (
                <p className="text-sm">{member.trainerName ?? <span className="text-ink-muted">Not assigned</span>}</p>
              )}
            </CardBody>
          </Card>
          {visits && (
            <Card>
              <CardHeader title="Attendance" />
              <div className="grid grid-cols-3 divide-x divide-line border-b border-line text-center">
                <MiniStat label="This month" value={visits.thisMonth} />
                <MiniStat label="Last 30 days" value={visits.last30} />
                <MiniStat label="Day streak" value={visits.streak} />
              </div>
              {visits.visits.length === 0 ? (
                <p className="px-5 py-4 text-sm text-ink-muted">No visits recorded yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {visits.visits.map((v) => (
                    <li key={v.id} className="flex justify-between px-5 py-2.5 text-[13px]">
                      <span>{formatDate(v.date)}</span>
                      <span className="tabular text-ink-muted">
                        {formatTime(v.checkInAt, ctx.gym.timezone)}
                        {v.checkOutAt ? ` – ${formatTime(v.checkOutAt, ctx.gym.timezone)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          {canQr && <QrCard memberId={member.id} memberName={member.fullName} memberCode={member.memberCode} gymName={ctx.gym.name} canRegenerate={canManage} />}
          <Card>
            <CardHeader title="FITO app access" />
            <CardBody className="text-sm text-ink-muted">
              {member.hasAccount ? (
                <p>
                  <span className="font-medium text-success">Active.</span> {member.fullName.split(" ")[0]} can sign in to see their membership,
                  check-in code and workouts.
                </p>
              ) : member.inviteActive && member.inviteExpiresAt ? (
                <p>Invited. The link is valid until {formatDate(member.inviteExpiresAt.toISOString().slice(0, 10))}.</p>
              ) : (
                <p>Not signed up yet. Send an invite link from the menu.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-2 py-3">
      <div className="tabular text-xl font-semibold">{value}</div>
      <div className="text-[11.5px] text-ink-subtle">{label}</div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-[12px] text-ink-subtle">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
      {hint && <div className="mt-0.5 text-[12px] text-ink-muted">{hint}</div>}
    </div>
  );
}

function Detail({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
      <div className="min-w-0">
        <div className="text-[12px] text-ink-subtle">{label}</div>
        <div className="mt-0.5 break-words text-sm">{value ?? <span className="text-ink-subtle">—</span>}</div>
      </div>
    </div>
  );
}
