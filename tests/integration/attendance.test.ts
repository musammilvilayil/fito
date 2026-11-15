import { beforeEach, describe, expect, it } from "vitest";
import { addDays, todayIn } from "@/shared/dates";
import { qrPayload } from "@/shared/schemas/attendance";
import { inGym, type GymContext } from "@/server/auth/context";
import { AppError } from "@/server/errors";
import { acceptInvite } from "@/server/modules/auth/service";
import { attendanceSummary, checkIn, checkOut, hourlyCounts, listDay, memberAttendance } from "@/server/modules/attendance/service";
import { sellMembership } from "@/server/modules/memberships/service";
import { createMember, getMember, regenerateQr } from "@/server/modules/members/service";
import { createPlan } from "@/server/modules/plans/service";
import { getReport } from "@/server/modules/reports/service";
import { inviteStaff } from "@/server/modules/staff/service";
import { adminPool, contextFor, meta, newGym, resetDb, uniquePhone } from "../support/db";

const base = { email: null, gender: null, dateOfBirth: null, address: null, emergencyContactName: null, emergencyContactPhone: null, notes: null, joinedOn: null, assignedTrainerId: null };

async function gymWithPlan(name = "Attendance Gym") {
  const { ctx } = await newGym(name);
  const plan = await inGym(ctx, (tx) =>
    createPlan(tx, ctx, { name: "Monthly", description: null, durationUnit: "months", durationValue: 1, price: 100000, admissionFee: 0, isActive: true }),
  );
  return { ctx, plan, today: todayIn(ctx.gym.timezone) };
}

async function member(ctx: GymContext, fullName: string, planId?: string, startDate?: string) {
  const m = await inGym(ctx, (tx) => createMember(tx, ctx, { ...base, fullName, phone: uniquePhone() }));
  if (planId) {
    await inGym(ctx, (tx) =>
      sellMembership(tx, ctx, { memberId: m.id, planId, startDate: startDate ?? null, chargeAdmission: false, discountType: "amount", discountValue: null, discountNote: null, payNow: false } as never),
    );
  }
  const detail = await inGym(ctx, (tx) => getMember(tx, ctx, m.id));
  return { id: m.id, qr: qrPayload(detail.qrToken) };
}

const scan = (ctx: GymContext, qr: string, overrideReason: string | null = null) => inGym(ctx, (tx) => checkIn(tx, ctx, { qr, overrideReason }));
const code = async (p: Promise<unknown>) => ((await p.catch((e) => e)) as AppError).code;

async function staff(owner: GymContext, role: "receptionist" | "trainer") {
  const inv = await inGym(owner, (tx) => inviteStaff(tx, owner, { fullName: role, phone: uniquePhone(), email: null, role, specializations: [] }));
  const s = await acceptInvite({ token: inv.inviteUrl.split("/").pop()!, password: "staff-pass-1" }, null, meta);
  return contextFor(s.token!);
}

describe("QR attendance", () => {
  beforeEach(resetDb);

  it("checks in an active member once per day and checks them out", async () => {
    const { ctx, plan } = await gymWithPlan();
    const m = await member(ctx, "Active Ann", plan.id);
    const r = await scan(ctx, m.qr);
    expect(r.member).toMatchObject({ fullName: "Active Ann", standing: "active", planName: "Monthly" });
    expect(await code(scan(ctx, m.qr))).toBe("already_checked_in");

    const summary = await inGym(ctx, (tx) => attendanceSummary(tx, ctx));
    expect(summary).toMatchObject({ today: 1, insideNow: 1 });
    await inGym(ctx, (tx) => checkOut(tx, ctx, r.attendanceId));
    expect((await inGym(ctx, (tx) => attendanceSummary(tx, ctx))).insideNow).toBe(0);
    expect((await inGym(ctx, (tx) => listDay(tx, ctx, todayIn(ctx.gym.timezone))))[0]).toMatchObject({ fullName: "Active Ann", method: "qr" });
  });

  it("refuses expired, frozen-less, unknown and foreign QR codes", async () => {
    const { ctx, plan, today } = await gymWithPlan();
    const expired = await member(ctx, "Expired Eby", plan.id, addDays(today, -60));
    const none = await member(ctx, "No Plan Nina");
    const other = await gymWithPlan("Other Gym");
    const foreign = await member(other.ctx, "Foreigner", other.plan.id);

    expect(await code(scan(ctx, expired.qr))).toBe("not_allowed_expired");
    expect(await code(scan(ctx, none.qr))).toBe("not_allowed_none");
    expect(await code(scan(ctx, foreign.qr))).toBe("unknown_qr");
    expect(await code(scan(ctx, "https://example.com/not-a-member"))).toBe("invalid_qr");

    // A regenerated code invalidates the old one
    const active = await member(ctx, "Regen Raj", plan.id);
    await inGym(ctx, (tx) => regenerateQr(tx, ctx, active.id));
    expect(await code(scan(ctx, active.qr))).toBe("unknown_qr");
  });

  it("lets owners override with a reason, but not front desk", async () => {
    const { ctx, plan, today } = await gymWithPlan();
    const expired = await member(ctx, "Late Lal", plan.id, addDays(today, -40));
    const desk = await staff(ctx, "receptionist");
    expect(((await scan(desk, expired.qr, "Paying tomorrow").catch((e) => e)) as AppError).status).toBe(403);
    const r = await scan(ctx, expired.qr, "Paying tomorrow");
    expect(r.overridden).toBe(true);
    const trainer = await staff(ctx, "trainer");
    expect(((await scan(trainer, expired.qr).catch((e) => e)) as AppError).status).toBe(403);
  });

  it("tracks visits, monthly count and streak", async () => {
    const { ctx, plan, today } = await gymWithPlan();
    const m = await member(ctx, "Streak Sam", plan.id);
    for (const d of [1, 2, 3, 5]) {
      await adminPool().query(
        "insert into attendance (gym_id, member_id, check_in_date, check_in_at, method) values ($1, $2, $3, $4, 'qr')",
        [ctx.gym.id, m.id, addDays(today, -d), `${addDays(today, -d)}T01:30:00Z`],
      );
    }
    let a = await inGym(ctx, (tx) => memberAttendance(tx, ctx, m.id));
    expect(a.streak).toBe(3); // yesterday, 2 and 3 days ago
    await scan(ctx, m.qr);
    a = await inGym(ctx, (tx) => memberAttendance(tx, ctx, m.id));
    expect(a).toMatchObject({ streak: 4, total: 5, last30: 5, lastVisit: today });

    const hours = await inGym(ctx, (tx) => hourlyCounts(tx, ctx, addDays(today, -7), today));
    expect(hours.reduce((s, h) => s + h.count, 0)).toBe(5);
    expect(hours.find((h) => h.hour === 7)?.count).toBe(4); // 01:30 UTC = 07:00 IST
  });
});

describe("reports", () => {
  beforeEach(resetDb);

  it("summarises members, revenue, renewals and attendance for a range", async () => {
    const { ctx, plan, today } = await gymWithPlan("Report Gym");
    const renewed = await member(ctx, "Renewed Rita", plan.id, addDays(today, -40));
    await inGym(ctx, (tx) =>
      sellMembership(tx, ctx, { memberId: renewed.id, planId: plan.id, startDate: null, chargeAdmission: false, discountType: "amount", discountValue: null, discountNote: null, payNow: true, payment: { amount: 100000, method: "cash", reference: null } } as never),
    );
    await member(ctx, "Lapsed Leo", plan.id, addDays(today, -40));
    const active = await member(ctx, "Present Priya", plan.id);
    await scan(ctx, active.qr);

    const r = await inGym(ctx, (tx) => getReport(tx, ctx, { from: addDays(today, -29), to: today }));
    expect(r.members).toMatchObject({ total: 3, active: 2, expired: 1, newInRange: 3 });
    // Unpaid: Rita's first membership, Leo's and Priya's (3 x ₹1,000)
    expect(r.revenue).toMatchObject({ collected: 100000, net: 100000, outstanding: 300000 });
    expect(r.renewals).toMatchObject({ due: 2, renewed: 1, rate: 0.5 });
    expect(r.attendance).toMatchObject({ total: 1, uniqueMembers: 1 });
    expect(r.monthly).toHaveLength(12);
    expect(r.monthly.at(-1)?.revenue).toBe(100000);
    expect(r.attendance.daily).toHaveLength(30);

    const desk = await staff(ctx, "receptionist");
    expect(((await inGym(desk, (tx) => getReport(tx, desk, {})).catch((e) => e)) as AppError).status).toBe(403);
  });
});
