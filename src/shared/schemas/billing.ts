import { z } from "zod";
import { isoDate, optionalIsoDate, optionalText, requiredText, rupeesField } from "./common";

export const PAYMENT_METHODS = ["cash", "upi", "card", "bank_transfer", "online", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
/** Methods staff can pick when recording a payment by hand. */
export const RECORDABLE_METHODS = ["cash", "upi", "card", "bank_transfer"] as const;
export const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  bank_transfer: "Bank transfer",
  online: "Online",
  other: "Other / imported",
};

export const PLAN_PRESETS = [
  { name: "Monthly", durationUnit: "months", durationValue: 1 },
  { name: "Quarterly", durationUnit: "months", durationValue: 3 },
  { name: "Half-yearly", durationUnit: "months", durationValue: 6 },
  { name: "Annual", durationUnit: "months", durationValue: 12 },
] as const;

export const planSchema = z.object({
  name: requiredText("Plan name", 80),
  description: optionalText(500),
  durationUnit: z.enum(["days", "months"]),
  durationValue: z.coerce.number().int("Whole numbers only").min(1, "At least 1").max(730, "Too long"),
  price: rupeesField("Price"),
  admissionFee: rupeesField("Admission fee"),
  isActive: z.boolean().default(true),
});
export type PlanInput = z.input<typeof planSchema>;

const paymentPart = z.object({
  amount: rupeesField("Amount"),
  method: z.enum(RECORDABLE_METHODS),
  reference: optionalText(120),
});

export const sellMembershipSchema = z
  .object({
    memberId: z.uuid(),
    planId: z.uuid({ error: "Choose a plan" }),
    startDate: optionalIsoDate,
    chargeAdmission: z.boolean().default(false),
    discountType: z.enum(["amount", "percent"]).default("amount"),
    discountValue: z.union([z.string(), z.number()]).optional().nullable(),
    discountNote: optionalText(200),
    payNow: z.boolean().default(true),
    payment: paymentPart.optional(),
  })
  .refine((v) => !v.payNow || v.payment, { message: "Enter the payment details", path: ["payment.amount"] });
export type SellMembershipInput = z.input<typeof sellMembershipSchema>;

export const recordPaymentSchema = z.object({
  memberId: z.uuid(),
  membershipId: z.uuid({ error: "Choose the membership this payment is for" }),
  amount: rupeesField("Amount"),
  method: z.enum(RECORDABLE_METHODS),
  reference: optionalText(120),
  notes: optionalText(300),
  paidOn: optionalIsoDate,
});
export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;

export const refundSchema = z.object({
  amount: rupeesField("Refund amount"),
  method: z.enum(RECORDABLE_METHODS),
  reason: requiredText("Reason", 300),
});

export const voidSchema = z.object({ reason: requiredText("Reason", 300) });

export const freezeSchema = z.object({
  startDate: optionalIsoDate,
  reason: optionalText(300),
});

export const unfreezeSchema = z.object({ resumeDate: optionalIsoDate });

export const cancelMembershipSchema = z.object({ reason: requiredText("Reason", 300) });

export const paymentListQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type PaymentListQuery = z.output<typeof paymentListQuery>;

/** Price breakdown for a sale; shared so the form preview matches the server exactly. */
export function priceBreakdown(opts: {
  pricePaise: number;
  admissionFeePaise: number;
  chargeAdmission: boolean;
  discountType: "amount" | "percent";
  discountPaise?: number;
  discountPercent?: number;
}) {
  const admission = opts.chargeAdmission ? opts.admissionFeePaise : 0;
  const subtotal = opts.pricePaise + admission;
  const discount =
    opts.discountType === "percent"
      ? Math.round((subtotal * Math.min(100, Math.max(0, opts.discountPercent ?? 0))) / 100)
      : Math.max(0, opts.discountPaise ?? 0);
  return { price: opts.pricePaise, admission, subtotal, discount, total: subtotal - discount };
}
