"use client";

import { Ban, FileText, MoreHorizontal, Pause, Play, Plus, ReceiptIndianRupee, RotateCcw, Undo2, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input, Select } from "@/components/ui/form";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { EmptyState } from "@/components/ui/states";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { api, errorMessage } from "@/lib/api";
import { useApiForm } from "@/lib/use-api-form";
import { diffDays, formatDate, formatDateTime } from "@/shared/dates";
import { durationLabel } from "@/shared/membership";
import { formatINR, rupeesToPaise } from "@/shared/money";
import { METHOD_LABELS, priceBreakdown, RECORDABLE_METHODS, recordPaymentSchema, sellMembershipSchema, type PaymentMethod } from "@/shared/schemas/billing";

export type BillingMembership = {
  id: string;
  planName: string;
  durationUnit: "days" | "months";
  durationValue: number;
  kind: "new" | "renewal";
  startDate: string;
  endDate: string;
  totalPaise: number;
  discountPaise: number;
  paidPaise: number;
  outstandingPaise: number;
  phase: "current" | "upcoming" | "ended" | "frozen" | "cancelled";
  frozenSince: string | null;
  cancelReason: string | null;
};
export type BillingPayment = {
  id: string;
  kind: "payment" | "refund";
  amountPaise: number;
  method: PaymentMethod;
  status: "completed" | "pending" | "failed" | "void";
  paidAt: string;
  receiptNumber: string | null;
  reference: string | null;
  notes: string | null;
  membershipId: string | null;
  refundOfId: string | null;
};
export type BillingPlan = { id: string; name: string; durationUnit: "days" | "months"; durationValue: number; pricePaise: number; admissionFeePaise: number };

const PHASE: Record<BillingMembership["phase"], { label: string; tone: BadgeTone }> = {
  current: { label: "Current", tone: "success" },
  upcoming: { label: "Upcoming", tone: "info" },
  ended: { label: "Ended", tone: "neutral" },
  frozen: { label: "Frozen", tone: "info" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

type Perms = { sell: boolean; record: boolean; void: boolean };

export function MemberBilling({
  memberId,
  memberName,
  memberActive,
  memberships,
  payments,
  plans,
  suggestedStart,
  today,
  perms,
}: {
  memberId: string;
  memberName: string;
  memberActive: boolean;
  memberships: BillingMembership[];
  payments: BillingPayment[];
  plans: BillingPlan[];
  suggestedStart: string;
  today: string;
  perms: Perms;
}) {
  const router = useRouter();
  const [sellOpen, setSellOpen] = useState(false);
  const [payFor, setPayFor] = useState<BillingMembership | null>(null);
  const [freezeFor, setFreezeFor] = useState<BillingMembership | null>(null);
  const [unfreezeFor, setUnfreezeFor] = useState<BillingMembership | null>(null);
  const [cancelFor, setCancelFor] = useState<BillingMembership | null>(null);
  const [refundFor, setRefundFor] = useState<BillingPayment | null>(null);
  const [voidFor, setVoidFor] = useState<BillingPayment | null>(null);
  const done = (msg: string) => {
    toast.success(msg);
    router.refresh();
  };
  const isNew = memberships.filter((m) => m.phase !== "cancelled").length === 0;
  const membershipMenu = (m: BillingMembership) =>
    (perms.record || perms.sell) && m.phase !== "cancelled" ? (
      <Menu
        trigger={
          <Button variant="ghost" size="icon" aria-label={`Actions for ${m.planName} membership`}>
            <MoreHorizontal />
          </Button>
        }
      >
        {perms.record && m.outstandingPaise > 0 && (
          <MenuItem onSelect={() => setPayFor(m)}>
            <ReceiptIndianRupee /> Record payment
          </MenuItem>
        )}
        {perms.sell && m.phase === "current" && (
          <MenuItem onSelect={() => setFreezeFor(m)}>
            <Pause /> Freeze
          </MenuItem>
        )}
        {perms.sell && m.phase === "frozen" && (
          <MenuItem onSelect={() => setUnfreezeFor(m)}>
            <Play /> Unfreeze
          </MenuItem>
        )}
        {perms.sell && (
          <>
            <MenuSeparator />
            <MenuItem danger onSelect={() => setCancelFor(m)}>
              <Ban /> Cancel membership
            </MenuItem>
          </>
        )}
      </Menu>
    ) : null;
  const membershipName = (id: string | null) => memberships.find((m) => m.id === id)?.planName ?? "—";

  return (
    <>
      <Card>
        <CardHeader
          title="Memberships"
          description={isNew ? "No membership yet." : undefined}
          action={
            perms.sell &&
            memberActive && (
              <Button size="sm" onClick={() => setSellOpen(true)} disabled={plans.length === 0} title={plans.length === 0 ? "Create a plan first" : undefined}>
                <Plus /> {isNew ? "Sell membership" : "Renew / add"}
              </Button>
            )
          }
        />
        {memberships.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No memberships"
            description={plans.length === 0 ? "Create membership plans first (Plans page)." : `Sell ${memberName.split(" ")[0]} a plan to activate check-ins.`}
            className="py-10"
          />
        ) : (
          <>
          <ul className="divide-y divide-line md:hidden">
            {memberships.map((m) => (
              <li key={m.id} className="flex items-start gap-3 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{m.planName}</span>
                    <Badge tone={PHASE[m.phase].tone}>{PHASE[m.phase].label}</Badge>
                  </div>
                  <div className="mt-1 text-[12.5px] text-ink-muted">
                    {formatDate(m.startDate)} – {formatDate(m.endDate)}
                  </div>
                  <div className="mt-1 text-[12.5px] text-ink-subtle">
                    {formatINR(m.totalPaise)}
                    {m.outstandingPaise > 0 && <span className="font-medium text-warning"> · {formatINR(m.outstandingPaise)} due</span>}
                  </div>
                </div>
                {membershipMenu(m)}
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
          <Table>
            <THead>
              <tr>
                <TH>Plan</TH>
                <TH>Period</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-right">Due</TH>
                <TH>Status</TH>
                <TH className="w-10" />
              </tr>
            </THead>
            <TBody>
              {memberships.map((m) => (
                <TR key={m.id}>
                  <TD>
                    <div className="font-medium">{m.planName}</div>
                    <div className="text-[12px] text-ink-subtle">
                      {durationLabel(m.durationUnit, m.durationValue)} · {m.kind === "renewal" ? "Renewal" : "New"}
                    </div>
                  </TD>
                  <TD className="whitespace-nowrap text-[13px] text-ink-muted">
                    {formatDate(m.startDate)} – {formatDate(m.endDate)}
                    {m.frozenSince && <div className="text-[12px] text-info">Frozen since {formatDate(m.frozenSince)}</div>}
                  </TD>
                  <TD className="tabular text-right">{formatINR(m.totalPaise)}</TD>
                  <TD className="tabular text-right">
                    {m.outstandingPaise > 0 ? <span className="font-medium text-warning">{formatINR(m.outstandingPaise)}</span> : <span className="text-ink-subtle">—</span>}
                  </TD>
                  <TD>
                    <Badge tone={PHASE[m.phase].tone}>{PHASE[m.phase].label}</Badge>
                  </TD>
                  <TD>
                    {membershipMenu(m)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          </div>
          </>
        )}
      </Card>

      <Card>
        <CardHeader title="Payments" />
        {payments.length === 0 ? (
          <EmptyState icon={ReceiptIndianRupee} title="No payments yet" className="py-10" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH className="hidden sm:table-cell">Date</TH>
                <TH>Receipt</TH>
                <TH className="hidden md:table-cell">For</TH>
                <TH className="hidden sm:table-cell">Method</TH>
                <TH className="text-right">Amount</TH>
                <TH className="w-10" />
              </tr>
            </THead>
            <TBody>
              {payments.map((p) => {
                const isVoid = p.status === "void";
                return (
                  <TR key={p.id} className={isVoid ? "opacity-55" : undefined}>
                    <TD className="hidden whitespace-nowrap text-[13px] text-ink-muted sm:table-cell">{formatDateTime(p.paidAt)}</TD>
                    <TD className="font-mono text-[12px]">
                      {p.receiptNumber ? (
                        <a href={`/api/v1/payments/${p.id}/receipt`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-lime">
                          <FileText className="size-3.5" /> {p.receiptNumber}
                        </a>
                      ) : (
                        <span className="text-ink-subtle">Imported</span>
                      )}
                      <div className="mt-0.5 font-sans text-[11.5px] text-ink-subtle sm:hidden">
                        {formatDateTime(p.paidAt)} · {METHOD_LABELS[p.method]}
                      </div>
                    </TD>
                    <TD className="hidden text-[13px] text-ink-muted md:table-cell">{membershipName(p.membershipId)}</TD>
                    <TD className="hidden text-[13px] sm:table-cell">{METHOD_LABELS[p.method]}</TD>
                    <TD className="tabular text-right">
                      <span className={p.kind === "refund" ? "text-danger" : isVoid ? "line-through" : "font-medium"}>
                        {p.kind === "refund" ? "−" : ""}
                        {formatINR(p.amountPaise)}
                      </span>
                      {isVoid && <div className="text-[11px] text-danger">Void</div>}
                      {p.kind === "refund" && <div className="text-[11px] text-ink-subtle">Refund</div>}
                    </TD>
                    <TD>
                      {perms.void && !isVoid && (
                        <Menu
                          trigger={
                            <Button variant="ghost" size="icon" aria-label={`Actions for payment ${p.receiptNumber ?? ""}`}>
                              <MoreHorizontal />
                            </Button>
                          }
                        >
                          {p.kind === "payment" && (
                            <MenuItem onSelect={() => setRefundFor(p)}>
                              <Undo2 /> Refund
                            </MenuItem>
                          )}
                          <MenuItem danger onSelect={() => setVoidFor(p)}>
                            <RotateCcw /> Void (entered by mistake)
                          </MenuItem>
                        </Menu>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      {sellOpen && (
        <SellDialog
          memberId={memberId}
          plans={plans}
          suggestedStart={suggestedStart}
          isNew={isNew}
          canRecord={perms.record}
          onClose={() => setSellOpen(false)}
          onDone={(msg) => {
            setSellOpen(false);
            done(msg);
          }}
        />
      )}
      {payFor && (
        <PaymentDialog
          memberId={memberId}
          membership={payFor}
          today={today}
          onClose={() => setPayFor(null)}
          onDone={() => {
            setPayFor(null);
            done("Payment recorded");
          }}
        />
      )}
      {freezeFor && (
        <ActionDialog
          title={`Freeze ${freezeFor.planName}`}
          description="Check-ins stop while frozen. When you unfreeze, the frozen days are added to the end date."
          submitLabel="Freeze membership"
          fields={[
            { name: "startDate", label: "Freeze from", type: "date", defaultValue: today },
            { name: "reason", label: "Reason", placeholder: "Travel, illness…" },
          ]}
          onSubmit={(v) => api(`/memberships/${freezeFor.id}/freeze`, { body: v })}
          onClose={() => setFreezeFor(null)}
          onDone={() => {
            setFreezeFor(null);
            done("Membership frozen");
          }}
        />
      )}
      {unfreezeFor && (
        <ActionDialog
          title={`Unfreeze ${unfreezeFor.planName}`}
          description={`Frozen since ${formatDate(unfreezeFor.frozenSince)}. The end date moves forward by the days frozen (${Math.max(0, diffDays(unfreezeFor.frozenSince!, today))} so far).`}
          submitLabel="Unfreeze"
          fields={[{ name: "resumeDate", label: "Resume on", type: "date", defaultValue: today }]}
          onSubmit={(v) => api(`/memberships/${unfreezeFor.id}/unfreeze`, { body: v })}
          onClose={() => setUnfreezeFor(null)}
          onDone={() => {
            setUnfreezeFor(null);
            done("Membership resumed");
          }}
        />
      )}
      {cancelFor && (
        <ActionDialog
          title={`Cancel ${cancelFor.planName}?`}
          description="The member can't check in on this membership any more. Payments stay on record; record a refund separately if you return money."
          submitLabel="Cancel membership"
          danger
          fields={[{ name: "reason", label: "Reason", required: true }]}
          onSubmit={(v) => api(`/memberships/${cancelFor.id}/cancel`, { body: v })}
          onClose={() => setCancelFor(null)}
          onDone={() => {
            setCancelFor(null);
            done("Membership cancelled");
          }}
        />
      )}
      {refundFor && (
        <ActionDialog
          title={`Refund ${refundFor.receiptNumber ?? "payment"}`}
          description={`Original payment ${formatINR(refundFor.amountPaise)}. The refund gets its own receipt.`}
          submitLabel="Record refund"
          fields={[
            { name: "amount", label: "Refund amount (₹)", defaultValue: String(refundFor.amountPaise / 100), required: true },
            { name: "method", label: "Refunded by", type: "method", defaultValue: "cash" },
            { name: "reason", label: "Reason", required: true },
          ]}
          onSubmit={(v) => api(`/payments/${refundFor.id}/refund`, { body: v })}
          onClose={() => setRefundFor(null)}
          onDone={() => {
            setRefundFor(null);
            done("Refund recorded");
          }}
        />
      )}
      {voidFor && (
        <ActionDialog
          title={`Void ${voidFor.receiptNumber ?? "payment"}?`}
          description="Use this only for a payment entered by mistake. It stays visible but no longer counts in totals."
          submitLabel="Void payment"
          danger
          fields={[{ name: "reason", label: "Reason", required: true, placeholder: "Entered twice" }]}
          onSubmit={(v) => api(`/payments/${voidFor.id}/void`, { body: v })}
          onClose={() => setVoidFor(null)}
          onDone={() => {
            setVoidFor(null);
            done("Payment voided");
          }}
        />
      )}
    </>
  );
}

function SellDialog({
  memberId,
  plans,
  suggestedStart,
  isNew,
  canRecord,
  onClose,
  onDone,
}: {
  memberId: string;
  plans: BillingPlan[];
  suggestedStart: string;
  isNew: boolean;
  canRecord: boolean;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const { form, formError, run, errors, submitting } = useApiForm(sellMembershipSchema, {
    memberId,
    planId: plans[0]?.id ?? "",
    startDate: suggestedStart,
    chargeAdmission: isNew,
    discountType: "amount",
    discountValue: "",
    discountNote: "",
    payNow: canRecord,
    payment: { amount: "", method: "cash", reference: "" },
  });
  const reg = form.register;
  const [planId, chargeAdmission, discountType, discountValue, payNow] = form.watch(["planId", "chargeAdmission", "discountType", "discountValue", "payNow"]);
  const plan = plans.find((p) => p.id === planId);
  const discountRaw = String(discountValue ?? "").trim();
  const b = plan
    ? priceBreakdown({
        pricePaise: plan.pricePaise,
        admissionFeePaise: plan.admissionFeePaise,
        chargeAdmission: Boolean(chargeAdmission),
        discountType: discountType ?? "amount",
        discountPaise: discountType === "amount" ? (rupeesToPaise(discountRaw || "0") ?? 0) : 0,
        discountPercent: discountType === "percent" ? Number(discountRaw || 0) : 0,
      })
    : null;
  const [amountTouched, setAmountTouched] = useState(false);
  useEffect(() => {
    if (b && !amountTouched) form.setValue("payment.amount", String(Math.max(0, b.total) / 100));
  }, [b?.total, amountTouched]); // eslint-disable-line react-hooks/exhaustive-deps
  const payErr = (errors as { payment?: Record<string, { message?: string }> }).payment;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={isNew ? "Sell membership" : "Renew or add membership"} size="lg">
      <form
        noValidate
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async (values) => {
            const r = await api<{ payment: { receiptNumber: string } | null }>("/memberships", { body: values });
            onDone(r.payment ? `Membership added · receipt ${r.payment.receiptNumber}` : "Membership added");
          });
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Plan" htmlFor="s-plan" error={(errors.planId as { message?: string })?.message}>
            <Select id="s-plan" {...reg("planId")}>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {durationLabel(p.durationUnit, p.durationValue)} · {formatINR(p.pricePaise)}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Start date"
            htmlFor="s-start"
            error={(errors.startDate as { message?: string })?.message}
            hint={isNew ? undefined : "Defaults to the day after the current membership ends"}
          >
            <Input id="s-start" type="date" {...reg("startDate")} />
          </Field>
        </div>
        {plan && plan.admissionFeePaise > 0 && (
          <Checkbox label={`Charge admission fee (${formatINR(plan.admissionFeePaise)})`} {...reg("chargeAdmission")} />
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)]">
          <Field label="Discount" htmlFor="s-dtype">
            <Select id="s-dtype" {...reg("discountType")}>
              <option value="amount">₹ amount</option>
              <option value="percent">% percent</option>
            </Select>
          </Field>
          <Field label={discountType === "percent" ? "Discount %" : "Discount ₹"} htmlFor="s-dval" error={(errors.discountValue as { message?: string })?.message}>
            <Input id="s-dval" inputMode="decimal" placeholder="0" {...reg("discountValue")} />
          </Field>
          <Field label="Discount note" htmlFor="s-dnote">
            <Input id="s-dnote" placeholder="Festival offer" {...reg("discountNote")} />
          </Field>
        </div>

        {b && (
          <div className="rounded-xl border border-line bg-raised/60 p-4 text-sm">
            <Row label={`${plan!.name} membership`} value={formatINR(b.price)} />
            {b.admission > 0 && <Row label="Admission fee" value={formatINR(b.admission)} />}
            {b.discount > 0 && <Row label="Discount" value={`−${formatINR(b.discount)}`} tone="text-success" />}
            <div className="mt-2 flex justify-between border-t border-line pt-2 font-semibold">
              <span>Total</span>
              <span className="tabular">{b.total >= 0 ? formatINR(b.total) : "—"}</span>
            </div>
          </div>
        )}

        {canRecord && (
          <div className="space-y-4 rounded-xl border border-line p-4">
            <Checkbox label="Record payment now" {...reg("payNow")} />
            {payNow && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Amount received (₹)" htmlFor="s-amt" error={payErr?.amount?.message} hint="Less than total = part payment">
                  <Input id="s-amt" inputMode="decimal" {...reg("payment.amount", { onChange: () => setAmountTouched(true) })} />
                </Field>
                <Field label="Method" htmlFor="s-method">
                  <Select id="s-method" {...reg("payment.method")}>
                    {RECORDABLE_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {METHOD_LABELS[m]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Reference" htmlFor="s-ref" hint="UPI / card txn ID">
                  <Input id="s-ref" {...reg("payment.reference")} />
                </Field>
              </div>
            )}
          </div>
        )}
        <FormError message={formError} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {payNow ? "Save and issue receipt" : "Save membership"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex justify-between py-0.5 text-ink-muted">
      <span>{label}</span>
      <span className={`tabular ${tone ?? "text-ink"}`}>{value}</span>
    </div>
  );
}

function PaymentDialog({
  memberId,
  membership,
  today,
  onClose,
  onDone,
}: {
  memberId: string;
  membership: BillingMembership;
  today: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { form, formError, run, errors, submitting } = useApiForm(recordPaymentSchema, {
    memberId,
    membershipId: membership.id,
    amount: String(membership.outstandingPaise / 100),
    method: "cash",
    reference: "",
    notes: "",
    paidOn: today,
  });
  const reg = form.register;
  const err = (k: string) => (errors as Record<string, { message?: string }>)[k]?.message;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Record payment · ${membership.planName}`} description={`Due: ${formatINR(membership.outstandingPaise)}`}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async (values) => {
            await api("/payments", { body: values });
            onDone();
          });
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Amount (₹)" htmlFor="p-amt" error={err("amount")}>
            <Input id="p-amt" inputMode="decimal" {...reg("amount")} aria-invalid={!!err("amount")} />
          </Field>
          <Field label="Method" htmlFor="p-method">
            <Select id="p-method" {...reg("method")}>
              {RECORDABLE_METHODS.map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABELS[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Paid on" htmlFor="p-date" error={err("paidOn")}>
            <Input id="p-date" type="date" max={today} {...reg("paidOn")} />
          </Field>
          <Field label="Reference" htmlFor="p-ref" hint="UPI / card txn ID">
            <Input id="p-ref" {...reg("reference")} />
          </Field>
        </div>
        <FormError message={formError} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Record and issue receipt
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

type ActionField = {
  name: string;
  label: string;
  type?: "text" | "date" | "method";
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
};

/** Small dialog for one-step actions (freeze, cancel, refund, void). */
function ActionDialog({
  title,
  description,
  submitLabel,
  fields,
  danger,
  onSubmit,
  onClose,
  onDone,
}: {
  title: string;
  description: string;
  submitLabel: string;
  fields: ActionField[];
  danger?: boolean;
  onSubmit: (values: Record<string, string>) => Promise<unknown>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? ""])));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={title} description={description} size="sm">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const missing = fields.find((f) => f.required && !values[f.name]?.trim());
          if (missing) {
            setError(`${missing.label} is required`);
            return;
          }
          setBusy(true);
          setError(null);
          try {
            await onSubmit(values);
            onDone();
          } catch (err) {
            setError(errorMessage(err));
            setBusy(false);
          }
        }}
      >
        {fields.map((f) => (
          <Field key={f.name} label={f.label} htmlFor={`a-${f.name}`} required={f.required}>
            {f.type === "method" ? (
              <Select id={`a-${f.name}`} value={values[f.name]} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}>
                {RECORDABLE_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABELS[m]}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                id={`a-${f.name}`}
                type={f.type === "date" ? "date" : "text"}
                placeholder={f.placeholder}
                value={values[f.name]}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              />
            )}
          </Field>
        ))}
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" variant={danger ? "danger" : "primary"} loading={busy}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
