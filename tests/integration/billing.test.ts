import { beforeEach, describe, expect, it } from "vitest";
import { addDays, financialYear, todayIn } from "@/shared/dates";
import { paymentListQuery } from "@/shared/schemas/billing";
import { inGym, type GymContext } from "@/server/auth/context";
import { AppError } from "@/server/errors";
import { acceptInvite } from "@/server/modules/auth/service";
import {
  cancelMembership,
  freezeMembership,
  listMemberMemberships,
  sellMembership,
  unfreezeMembership,
} from "@/server/modules/memberships/service";
import { createMember, getMember } from "@/server/modules/members/service";
import { renderReceiptPdf } from "@/server/modules/payments/receipt-pdf";
import { getReceipt, listDues, listPayments, paymentSummary, recordPayment, refundPayment, voidPayment } from "@/server/modules/payments/service";
import { createPlan, listPlans, updatePlan } from "@/server/modules/plans/service";
import { inviteStaff } from "@/server/modules/staff/service";
import { getSetupStatus } from "@/server/modules/gyms/setup";
import { contextFor, meta, newGym, resetDb, uniquePhone } from "../support/db";

const memberBase = {
  email: null, gender: null, dateOfBirth: null, address: null, emergencyContactName: null,
  emergencyContactPhone: null, notes: null, joinedOn: null, assignedTrainerId: null,
};

async function setup() {
  const { ctx } = await newGym("Billing Gym");
  const today = todayIn(ctx.gym.timezone);
  const monthly = await inGym(ctx, (tx) =>
    createPlan(tx, ctx, { name: "Monthly", description: null, durationUnit: "months", durationValue: 1, price: 120000, admissionFee: 50000, isActive: true }),
  );
  const member = await inGym(ctx, (tx) => createMember(tx, ctx, { ...memberBase, fullName: "Anu Joseph", phone: uniquePhone() }));
  return { ctx, today, monthly, member };
}

const sell = (ctx: GymContext, input: Record<string, unknown>) =>
  inGym(ctx, (tx) =>
    sellMembership(tx, ctx, {
      chargeAdmission: false,
      discountType: "amount",
      discountValue: null,
      discountNote: null,
      payNow: false,
      startDate: null,
      ...input,
    } as never),
  );

async function staffCtx(owner: GymContext, role: "receptionist" | "trainer") {
  const inv = await inGym(owner, (tx) =>
    inviteStaff(tx, owner, { fullName: role, phone: uniquePhone(), email: null, role, specializations: [] }),
  );
  const s = await acceptInvite({ token: inv.inviteUrl.split("/").pop()!, password: "staff-pass-1" }, null, meta);
  return contextFor(s.token!);
}

describe("plans", () => {
  beforeEach(resetDb);

  it("creates, lists and archives plans with unique names", async () => {
    const { ctx, monthly } = await setup();
    const dup = await inGym(ctx, (tx) =>
      createPlan(tx, ctx, { name: "monthly", description: null, durationUnit: "months", durationValue: 1, price: 1, admissionFee: 0, isActive: true }),
    ).catch((e) => e);
    expect((dup as AppError).status).toBe(409);
    await inGym(ctx, (tx) => updatePlan(tx, ctx, monthly.id, { name: "Monthly", description: null, durationUnit: "months", durationValue: 1, price: 130000, admissionFee: 50000, isActive: false }));
    expect(await inGym(ctx, (tx) => listPlans(tx, ctx))).toHaveLength(0);
    expect((await inGym(ctx, (tx) => listPlans(tx, ctx, { includeInactive: true })))[0]?.pricePaise).toBe(130000);
  });
});

describe("selling and renewing memberships", () => {
  beforeEach(resetDb);

  it("sells a new membership with admission fee, discount and payment, and issues a receipt", async () => {
    const { ctx, today, monthly, member } = await setup();
    const r = await sell(ctx, {
      memberId: member.id,
      planId: monthly.id,
      chargeAdmission: true,
      discountType: "percent",
      discountValue: "10",
      discountNote: "Diwali offer",
      payNow: true,
      payment: { amount: 100000, method: "upi", reference: "UPI123" },
    });
    // 1200 + 500 = 1700, 10% off = 170 → 1530
    expect(r.membership).toMatchObject({ kind: "new", startDate: today, totalPaise: 153000, discountPaise: 17000, admissionFeePaise: 50000 });
    expect(r.payment?.receiptNumber).toBe(`BG/${financialYear(today)}/0001`);

    const [ms] = await inGym(ctx, (tx) => listMemberMemberships(tx, ctx, member.id));
    expect(ms).toMatchObject({ paidPaise: 100000, outstandingPaise: 53000, phase: "current" });

    const over = await inGym(ctx, (tx) =>
      recordPayment(tx, ctx, { memberId: member.id, membershipId: ms!.id, amount: 60000, method: "cash", reference: null, notes: null, paidOn: null }),
    ).catch((e) => e);
    expect((over as AppError).status).toBe(400);
    const p2 = await inGym(ctx, (tx) =>
      recordPayment(tx, ctx, { memberId: member.id, membershipId: ms!.id, amount: 53000, method: "cash", reference: null, notes: null, paidOn: null }),
    );
    expect(p2.receiptNumber).toBe(`BG/${financialYear(today)}/0002`);
    expect((await inGym(ctx, (tx) => listMemberMemberships(tx, ctx, member.id)))[0]?.outstandingPaise).toBe(0);
  });

  it("starts early renewals after the current period and rejects overlaps", async () => {
    const { ctx, today, monthly, member } = await setup();
    const first = await sell(ctx, { memberId: member.id, planId: monthly.id });
    const renewal = await sell(ctx, { memberId: member.id, planId: monthly.id });
    expect(renewal.membership).toMatchObject({ kind: "renewal", startDate: addDays(first.membership.endDate, 1), renewedFromId: first.membership.id });
    // Correlated counts (regression: unqualified outer columns counted the wrong rows)
    expect((await inGym(ctx, (tx) => listPlans(tx, ctx)))[0]?.activeMemberships).toBe(2);
    expect(await inGym(ctx, (tx) => getSetupStatus(tx, ctx))).toMatchObject({ plans: 1, members: 1 });
    const overlap = await sell(ctx, { memberId: member.id, planId: monthly.id, startDate: today }).catch((e) => e);
    expect((overlap as AppError).status).toBe(409);
  });

  it("starts a late renewal today", async () => {
    const { ctx, today, monthly, member } = await setup();
    await sell(ctx, { memberId: member.id, planId: monthly.id, startDate: addDays(today, -45) });
    const late = await sell(ctx, { memberId: member.id, planId: monthly.id });
    expect(late.membership.startDate).toBe(today);
  });

  it("rejects discounts larger than the price", async () => {
    const { ctx, monthly, member } = await setup();
    const err = await sell(ctx, { memberId: member.id, planId: monthly.id, discountValue: "5000" }).catch((e) => e);
    expect((err as AppError).message).toMatch(/Discount can't be more/);
  });

  it("freezes and unfreezes, extending the end date and shifting a prepaid renewal", async () => {
    const { ctx, today, monthly, member } = await setup();
    const first = await sell(ctx, { memberId: member.id, planId: monthly.id, startDate: addDays(today, -10) });
    const renewal = await sell(ctx, { memberId: member.id, planId: monthly.id });
    await inGym(ctx, (tx) => freezeMembership(tx, ctx, first.membership.id, { startDate: addDays(today, -4), reason: "Travel" }));
    expect((await inGym(ctx, (tx) => getMember(tx, ctx, member.id))).standing).toBe("frozen");
    const again = await inGym(ctx, (tx) => freezeMembership(tx, ctx, first.membership.id, { startDate: null, reason: null })).catch((e) => e);
    expect((again as AppError).status).toBe(409);

    const res = await inGym(ctx, (tx) => unfreezeMembership(tx, ctx, first.membership.id, { resumeDate: today }));
    expect(res.extendedByDays).toBe(4);
    const rows = await inGym(ctx, (tx) => listMemberMemberships(tx, ctx, member.id));
    const f = rows.find((r) => r.id === first.membership.id)!;
    const r = rows.find((x) => x.id === renewal.membership.id)!;
    expect(f.endDate).toBe(addDays(first.membership.endDate, 4));
    expect(f.totalFrozenDays).toBe(4);
    expect(r.startDate).toBe(addDays(renewal.membership.startDate, 4));
    expect(r.startDate).toBe(addDays(f.endDate, 1));
  });

  it("cancels a membership so it no longer counts as due", async () => {
    const { ctx, monthly, member } = await setup();
    const m = await sell(ctx, { memberId: member.id, planId: monthly.id });
    expect(await inGym(ctx, (tx) => listDues(tx, ctx))).toHaveLength(1);
    await inGym(ctx, (tx) => cancelMembership(tx, ctx, m.membership.id, { reason: "Moved city" }));
    expect(await inGym(ctx, (tx) => listDues(tx, ctx))).toHaveLength(0);
    expect((await inGym(ctx, (tx) => getMember(tx, ctx, member.id))).standing).toBe("none");
  });
});

describe("payments", () => {
  beforeEach(resetDb);

  it("refunds, voids and reports collections by method", async () => {
    const { ctx, today, monthly, member } = await setup();
    const sold = await sell(ctx, { memberId: member.id, planId: monthly.id, payNow: true, payment: { amount: 120000, method: "cash", reference: null } });
    const payment = sold.payment!;

    const tooMuch = await inGym(ctx, (tx) => refundPayment(tx, ctx, payment.id, { amount: 130000, method: "cash", reason: "x" })).catch((e) => e);
    expect((tooMuch as AppError).status).toBe(400);
    await inGym(ctx, (tx) => refundPayment(tx, ctx, payment.id, { amount: 20000, method: "upi", reason: "Overcharged" }));

    const list = await inGym(ctx, (tx) => listPayments(tx, ctx, paymentListQuery.parse({ from: today, to: today })));
    expect(list).toMatchObject({ collected: 120000, refunded: 20000, net: 100000 });
    expect(list.byMethod).toEqual({ cash: 120000, upi: -20000 });
    expect(list.items[0]?.recordedBy).toBe("Billing Gym Owner");

    const summary = await inGym(ctx, (tx) => paymentSummary(tx, ctx));
    expect(summary).toMatchObject({ today: 100000, month: 100000, outstanding: 20000, membersWithDues: 1 });

    const blocked = await inGym(ctx, (tx) => voidPayment(tx, ctx, payment.id, "mistake")).catch((e) => e);
    expect((blocked as AppError).message).toMatch(/Void the refunds first/);
  });

  it("voids a mistaken payment so it stops counting", async () => {
    const { ctx, today, monthly, member } = await setup();
    const sold = await sell(ctx, { memberId: member.id, planId: monthly.id, payNow: true, payment: { amount: 120000, method: "card", reference: null } });
    await inGym(ctx, (tx) => voidPayment(tx, ctx, sold.payment!.id, "Entered twice"));
    const list = await inGym(ctx, (tx) => listPayments(tx, ctx, paymentListQuery.parse({ from: today, to: today })));
    expect(list.net).toBe(0);
    expect(list.items[0]?.status).toBe("void");
    expect((await inGym(ctx, (tx) => listMemberMemberships(tx, ctx, member.id)))[0]?.outstandingPaise).toBe(120000);
  });

  it("renders a PDF receipt", async () => {
    const { ctx, monthly, member } = await setup();
    const sold = await sell(ctx, { memberId: member.id, planId: monthly.id, chargeAdmission: true, payNow: true, payment: { amount: 170000, method: "upi", reference: "T1" } });
    const data = await inGym(ctx, (tx) => getReceipt(tx, ctx, sold.payment!.id));
    const pdf = await renderReceiptPdf(data, ctx.gym.timezone);
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5000);
  });

  it("enforces payment permissions by role", async () => {
    const { ctx, monthly, member } = await setup();
    const sold = await sell(ctx, { memberId: member.id, planId: monthly.id, payNow: true, payment: { amount: 120000, method: "cash", reference: null } });
    const desk = await staffCtx(ctx, "receptionist");
    const trainer = await staffCtx(ctx, "trainer");
    expect((await inGym(desk, (tx) => paymentSummary(tx, desk))).today).toBe(120000);
    const voidErr = await inGym(desk, (tx) => voidPayment(tx, desk, sold.payment!.id, "x")).catch((e) => e);
    expect((voidErr as AppError).status).toBe(403);
    const viewErr = await inGym(trainer, (tx) => paymentSummary(tx, trainer)).catch((e) => e);
    expect((viewErr as AppError).status).toBe(403);
    const sellErr = await sell(trainer, { memberId: member.id, planId: monthly.id }).catch((e) => e);
    expect((sellErr as AppError).status).toBe(403);
  });
});
