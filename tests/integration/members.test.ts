import { beforeEach, describe, expect, it } from "vitest";
import { addDays, todayIn } from "@/shared/dates";
import { memberListQuery } from "@/shared/schemas/member";
import { inGym, type GymContext } from "@/server/auth/context";
import { AppError } from "@/server/errors";
import { acceptInvite } from "@/server/modules/auth/service";
import { importMembers } from "@/server/modules/members/import";
import { assignTrainer, createMember, getMember, listMembers, setMemberStatus, updateMember } from "@/server/modules/members/service";
import { getMemberOverview } from "@/server/modules/reports/dashboard";
import { inviteStaff } from "@/server/modules/staff/service";
import { adminPool, contextFor, meta, newGym, resetDb, uniquePhone } from "../support/db";

const base = {
  email: null,
  gender: null,
  dateOfBirth: null,
  address: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  notes: null,
  joinedOn: null,
  assignedTrainerId: null,
};

async function addMember(ctx: GymContext, fullName: string, extra: Partial<typeof base & { phone: string | null }> = {}) {
  return inGym(ctx, (tx) => createMember(tx, ctx, { ...base, fullName, phone: uniquePhone(), ...extra }));
}

/** Inserts a membership directly (Phase 3 adds the real sales flow). */
async function addMembership(ctx: GymContext, memberId: string, start: string, end: string, frozenSince: string | null = null) {
  await adminPool().query(
    `insert into memberships (gym_id, member_id, plan_name, duration_unit, duration_value, start_date, end_date, price_paise, total_paise, frozen_since)
     values ($1, $2, 'Monthly', 'months', 1, $3, $4, 100000, 100000, $5)`,
    [ctx.gym.id, memberId, start, end, frozenSince],
  );
}

const list = (ctx: GymContext, q: Record<string, unknown> = {}) => inGym(ctx, (tx) => listMembers(tx, ctx, memberListQuery.parse(q)));

describe("members", () => {
  beforeEach(resetDb);

  it("creates members with sequential codes and an invite link", async () => {
    const { ctx } = await newGym();
    const a = await addMember(ctx, "Anjali Nair");
    const b = await addMember(ctx, "Bijoy Thomas");
    expect(a.memberCode).toBe("M0001");
    expect(b.memberCode).toBe("M0002");
    expect(a.inviteUrl).toMatch(/\/invite\//);
    const noContact = await addMember(ctx, "No Contact", { phone: null });
    expect(noContact.inviteUrl).toBeNull();
  });

  it("rejects a duplicate phone within the same gym but allows it in another gym", async () => {
    const g1 = await newGym("One");
    const g2 = await newGym("Two");
    const phone = uniquePhone();
    await addMember(g1.ctx, "First", { phone });
    const dup = await addMember(g1.ctx, "Second", { phone }).catch((e) => e);
    expect((dup as AppError).status).toBe(409);
    await expect(addMember(g2.ctx, "Elsewhere", { phone })).resolves.toBeTruthy();
  });

  it("searches by name, phone digits and code, and derives standings", async () => {
    const { ctx } = await newGym();
    const today = todayIn(ctx.gym.timezone);
    const active = await addMember(ctx, "Active Arjun");
    const expiring = await addMember(ctx, "Expiring Esha");
    const expired = await addMember(ctx, "Expired Eldho");
    const frozen = await addMember(ctx, "Frozen Fathima");
    const upcoming = await addMember(ctx, "Upcoming Uma");
    const renewed = await addMember(ctx, "Renewed Rahul");
    await addMember(ctx, "Nobody Nikhil");
    await addMembership(ctx, active.id, addDays(today, -5), addDays(today, 40));
    await addMembership(ctx, expiring.id, addDays(today, -25), addDays(today, 3));
    await addMembership(ctx, expired.id, addDays(today, -60), addDays(today, -2));
    await addMembership(ctx, frozen.id, addDays(today, -10), addDays(today, 20), addDays(today, -1));
    await addMembership(ctx, upcoming.id, addDays(today, 2), addDays(today, 31));
    // Ends in 2 days but already renewed for next month: not "expiring".
    await addMembership(ctx, renewed.id, addDays(today, -28), addDays(today, 2));
    await addMembership(ctx, renewed.id, addDays(today, 3), addDays(today, 33));

    const all = await list(ctx);
    const standing = Object.fromEntries(all.items.map((i) => [i.fullName, i.standing]));
    expect(standing).toMatchObject({
      "Active Arjun": "active",
      "Expiring Esha": "expiring",
      "Expired Eldho": "expired",
      "Frozen Fathima": "frozen",
      "Upcoming Uma": "upcoming",
      "Renewed Rahul": "active",
      "Nobody Nikhil": "none",
    });
    expect(all.counts).toMatchObject({ all: 7, active: 2, expiring: 1, expired: 1, frozen: 1, upcoming: 1, none: 1 });

    expect((await list(ctx, { status: "expiring" })).items.map((i) => i.fullName)).toEqual(["Expiring Esha"]);
    expect((await list(ctx, { q: "esha" })).items).toHaveLength(1);
    const member = await inGym(ctx, (tx) => getMember(tx, ctx, active.id));
    expect((await list(ctx, { q: member.phone!.slice(3) })).items.map((i) => i.fullName)).toEqual(["Active Arjun"]);
    expect((await list(ctx, { q: active.memberCode })).items).toHaveLength(1);
    expect((await list(ctx, { q: "100%" })).items).toHaveLength(0);

    const overview = await inGym(ctx, (tx) => getMemberOverview(tx, ctx));
    expect(overview).toMatchObject({ total: 7, active: 4, expiring: 1, expired: 1, noMembership: 1 });
    expect(overview.expiringList.map((m) => m.fullName)).toEqual(["Expired Eldho", "Expiring Esha"]);
  });

  it("deactivates and edits members", async () => {
    const { ctx } = await newGym();
    const m = await addMember(ctx, "Old Name");
    await inGym(ctx, (tx) => updateMember(tx, ctx, m.id, { fullName: "New Name", notes: "Prefers mornings" }));
    await inGym(ctx, (tx) => setMemberStatus(tx, ctx, m.id, "inactive"));
    const detail = await inGym(ctx, (tx) => getMember(tx, ctx, m.id));
    expect(detail).toMatchObject({ fullName: "New Name", notes: "Prefers mornings", status: "inactive", standing: "inactive" });
  });

  it("shows trainers only their assigned members", async () => {
    const owner = await newGym();
    const inv = await inGym(owner.ctx, (tx) =>
      inviteStaff(tx, owner.ctx, { fullName: "Tara Trainer", phone: uniquePhone(), email: null, role: "trainer", specializations: [] }),
    );
    const t = await acceptInvite({ token: inv.inviteUrl.split("/").pop()!, password: "trainer-pass" }, null, meta);
    const trainerCtx = await contextFor(t.token!);
    const mine = await addMember(owner.ctx, "Mine");
    const other = await addMember(owner.ctx, "Not Mine");
    await inGym(owner.ctx, (tx) => assignTrainer(tx, owner.ctx, mine.id, trainerCtx.staffId!));

    const seen = await list(trainerCtx);
    expect(seen.items.map((i) => i.fullName)).toEqual(["Mine"]);
    const blocked = await inGym(trainerCtx, (tx) => getMember(tx, trainerCtx, other.id)).catch((e) => e);
    expect((blocked as AppError).status).toBe(404);
    const write = await inGym(trainerCtx, (tx) => updateMember(tx, trainerCtx, mine.id, { notes: "x" })).catch((e) => e);
    expect((write as AppError).status).toBe(403);
  });

  it("does not let one gym read another gym's member by id", async () => {
    const g1 = await newGym("One");
    const g2 = await newGym("Two");
    const m = await addMember(g1.ctx, "Private Person");
    const err = await inGym(g2.ctx, (tx) => getMember(tx, g2.ctx, m.id)).catch((e) => e);
    expect((err as AppError).status).toBe(404);
  });
});

describe("member import", () => {
  beforeEach(resetDb);

  it("validates in a dry run, then imports members with their current membership", async () => {
    const { ctx } = await newGym();
    const today = todayIn(ctx.gym.timezone);
    const existingPhone = uniquePhone();
    await addMember(ctx, "Already Here", { phone: existingPhone });
    const rows = [
      { fullName: "Anu", phone: "98470 11122", gender: "F", membershipEnd: addDays(today, 20), membershipStart: addDays(today, -10), amountPaid: "1,500", planName: "Monthly" },
      { fullName: "Babu", phone: existingPhone },
      { fullName: "", phone: "98470 33344" },
      { fullName: "Chitra", phone: "12345" },
      { fullName: "Dev", phone: "98470 11122" },
      { fullName: "Eby", phone: null, membershipEnd: addDays(today, -3), amountPaid: "abc" },
      { fullName: "Fida", phone: "98470 55566", joinedOn: "2025-01-10" },
    ];
    const dry = await inGym(ctx, (tx) => importMembers(tx, ctx, rows, true));
    expect(dry).toMatchObject({ total: 7, ready: 2, duplicates: 1, errors: 4, created: 0 });
    expect(dry.rows[0]!.warnings[0]).toMatch(/Plan "Monthly" isn't set up/);
    expect(dry.rows[4]!.errors[0]).toMatch(/Same phone number as row 2/);
    expect((await list(ctx)).items).toHaveLength(1);

    const real = await inGym(ctx, (tx) => importMembers(tx, ctx, rows, false));
    expect(real).toMatchObject({ created: 2, membershipsCreated: 1 });
    const after = await list(ctx);
    expect(after.items.map((i) => i.fullName).sort()).toEqual(["Already Here", "Anu", "Fida"]);
    expect(after.items.find((i) => i.fullName === "Anu")?.standing).toBe("active");

    const pay = await adminPool().query("select amount_paise, method, notes from payments where gym_id = $1", [ctx.gym.id]);
    expect(pay.rows).toEqual([{ amount_paise: "150000", method: "other", notes: "Imported from previous records" }]);
  });
});
