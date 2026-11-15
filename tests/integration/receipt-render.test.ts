import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { inGym } from "@/server/auth/context";
import { sellMembership } from "@/server/modules/memberships/service";
import { createMember } from "@/server/modules/members/service";
import { renderReceiptPdf } from "@/server/modules/payments/receipt-pdf";
import { getReceipt } from "@/server/modules/payments/service";
import { createPlan } from "@/server/modules/plans/service";
import { newGym, resetDb, uniquePhone } from "../support/db";

// Writes a sample receipt for visual review when RECEIPT_SAMPLE is set.
it.runIf(process.env.RECEIPT_SAMPLE)("writes a sample receipt", async () => {
  await resetDb();
  const { ctx } = await newGym("Sample Gym");
  const plan = await inGym(ctx, (tx) => createPlan(tx, ctx, { name: "Quarterly", description: null, durationUnit: "months", durationValue: 3, price: 320000, admissionFee: 50000, isActive: true }));
  const m = await inGym(ctx, (tx) => createMember(tx, ctx, { fullName: "Sample Member", phone: uniquePhone(), email: null, gender: null, dateOfBirth: null, address: null, emergencyContactName: null, emergencyContactPhone: null, notes: null, joinedOn: null, assignedTrainerId: null }));
  const sold = await inGym(ctx, (tx) => sellMembership(tx, ctx, { memberId: m.id, planId: plan.id, startDate: null, chargeAdmission: true, discountType: "amount", discountValue: "200", discountNote: "Onam offer", payNow: true, payment: { amount: 200000, method: "upi", reference: "4412" } } as never));
  const data = await inGym(ctx, (tx) => getReceipt(tx, ctx, sold.payment!.id));
  writeFileSync(process.env.RECEIPT_SAMPLE!, await renderReceiptPdf(data, ctx.gym.timezone));
});
