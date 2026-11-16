import { beforeEach, describe, expect, it } from "vitest";
import { timeIn } from "@/shared/batches";
import { addDays, todayIn } from "@/shared/dates";
import { equipmentAddSchema } from "@/shared/schemas/equipment";
import { gymSettingsSchema } from "@/shared/schemas/gym";
import { inGym, type GymContext } from "@/server/auth/context";
import { findTool, toolsFor } from "@/server/modules/assistant/tools";
import { resolveSession } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { gymCrowd } from "@/server/modules/attendance/crowd";
import { scanGymCode } from "@/server/modules/attendance/self-scan";
import { checkIn } from "@/server/modules/attendance/service";
import { acceptInvite } from "@/server/modules/auth/service";
import { addEquipment, listEquipment, removeEquipment, updateEquipment } from "@/server/modules/equipment/service";
import { updateGymSettings } from "@/server/modules/gyms/service";
import { sellMembership } from "@/server/modules/memberships/service";
import { createMember, createMemberInvite } from "@/server/modules/members/service";
import { createPlan } from "@/server/modules/plans/service";
import { inviteStaff } from "@/server/modules/staff/service";
import { adminPool, contextFor, meta, newGym, resetDb, uniquePhone } from "../support/db";

const base = { email: null, gender: null, dateOfBirth: null, address: null, emergencyContactName: null, emergencyContactPhone: null, notes: null, joinedOn: null, assignedTrainerId: null };
const status = (e: unknown) => (e instanceof AppError ? e.status : String(e));
const code = (e: unknown) => (e instanceof AppError ? e.code : String(e));
const q = (text: string, params: unknown[] = []) => adminPool().query(text, params);

async function staff(owner: GymContext, role: "trainer" | "receptionist") {
  const inv = await inGym(owner, (tx) => inviteStaff(tx, owner, { fullName: role, phone: uniquePhone(), email: null, role, specializations: [] }));
  return contextFor((await acceptInvite({ token: inv.inviteUrl.split("/").pop()!, password: "staff-pass-1" }, null, meta)).token!);
}

/** A member with an app account and (optionally) an active membership. */
async function member(owner: GymContext, opts: { batch?: "morning" | "evening" | "any"; active?: boolean } = {}) {
  const m = await inGym(owner, (tx) => createMember(tx, owner, { ...base, fullName: "Scan Member", phone: uniquePhone(), batch: opts.batch ?? "any" }));
  if (opts.active !== false) {
    const plan = await inGym(owner, (tx) =>
      createPlan(tx, owner, { name: `Monthly ${Math.random()}`, description: null, durationUnit: "months", durationValue: 1, price: 100000, admissionFee: 0, isActive: true }),
    );
    await inGym(owner, (tx) =>
      sellMembership(tx, owner, { memberId: m!.id, planId: plan.id, startDate: null, chargeAdmission: false, discountType: "amount", discountValue: null, discountNote: null, payNow: false } as never),
    );
  }
  const inv = await inGym(owner, (tx) => createMemberInvite(tx, owner, m!.id));
  const s = await acceptInvite({ token: inv.inviteUrl.split("/").pop()!, password: "member-pass-1" }, null, meta);
  return { id: m!.id, token: s.token!, session: (await resolveSession(s.token!))!, ctx: await contextFor(s.token!) };
}

/** Batch windows that do and don't include the current time (gym-local). */
function windows() {
  const [h, m] = timeIn("Asia/Kolkata").split(":").map(Number) as [number, number];
  const now = h * 60 + m;
  const fmt = (x: number) => `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
  const inside = { start: fmt(Math.max(0, now - 60)), end: fmt(Math.min(23 * 60 + 59, now + 60)) };
  const outside = now < 12 * 60 ? { start: fmt(now + 120), end: fmt(now + 180) } : { start: fmt(now - 180), end: fmt(now - 120) };
  return { inside, outside };
}

/** Saves batch hours and policy, then returns a fresh owner context (contexts carry the settings). */
async function setBatches(token: string, policy: "off" | "warn" | "enforce", morning: { start: string; end: string }, evening: { start: string; end: string }) {
  const owner = await contextFor(token);
  await inGym(owner, (tx) =>
    updateGymSettings(
      tx,
      owner,
      gymSettingsSchema.parse({ expiringSoonDays: 7, sessionMinutes: 90, openingHours: null, morningStart: morning.start, morningEnd: morning.end, eveningStart: evening.start, eveningEnd: evening.end, batchPolicy: policy }),
    ),
  );
  return contextFor(token);
}

describe("equipment list", () => {
  beforeEach(resetDb);

  it("adds catalogue and custom items with quantities and keeps workout equipment in step", async () => {
    const { ctx: owner } = await newGym("Iron Gym");
    const add = (input: Record<string, unknown>) => inGym(owner, (tx) => addEquipment(tx, owner, equipmentAddSchema.parse(input)));
    const tm = await add({ catalogKey: "treadmill", quantity: 6 });
    await add({ catalogKey: "dumbbells", quantity: 20 });
    await add({ name: "Hammer Strength Row", category: "machine", quantity: 1 });
    expect(status(await add({ catalogKey: "treadmill", quantity: 1 }).catch((e) => e))).toBe(409);
    expect(status(await add({ catalogKey: "not-real" }).catch((e) => e))).toBe(400);

    await inGym(owner, (tx) => updateEquipment(tx, owner, tm.id, { quantity: 8, notes: "2 under repair" }));
    const list = await inGym(owner, (tx) => listEquipment(tx, owner));
    expect(list.items.map((i) => [i.name, i.quantity])).toEqual([
      ["Treadmill", 8],
      ["Dumbbells (pairs)", 20],
      ["Hammer Strength Row", 1],
    ]);
    expect(list.totalPieces).toBe(29);
    const settings = (await q(`select settings->'availableEquipment' as e from gyms where id = $1`, [owner.gym.id])).rows[0].e;
    expect(settings).toEqual(["body only", "dumbbell", "machine"]);

    await inGym(owner, (tx) => removeEquipment(tx, owner, tm.id));
    expect((await inGym(owner, (tx) => listEquipment(tx, owner))).items).toHaveLength(2);
  });

  it("lets trainers manage it, front desk and members only view it", async () => {
    const { ctx: owner } = await newGym("Role Gym");
    const trainer = await staff(owner, "trainer");
    const desk = await staff(owner, "receptionist");
    await inGym(trainer, (tx) => addEquipment(tx, trainer, equipmentAddSchema.parse({ catalogKey: "leg-press", quantity: 1 })));
    expect(status(await inGym(desk, (tx) => addEquipment(tx, desk, equipmentAddSchema.parse({ catalogKey: "rowing-machine" }))).catch((e) => e))).toBe(403);
    const m = await member(owner);
    expect((await inGym(m.ctx, (tx) => listEquipment(tx, m.ctx))).items.map((i) => i.name)).toEqual(["Leg press (45°)"]);
  });
});

describe("batches", () => {
  beforeEach(resetDb);

  it("warns, enforces with an owner override, and ignores 'any time' members", async () => {
    const { ctx: first, token } = await newGym("Batch Gym");
    const { inside, outside } = windows();
    const morningOutside = await member(first, { batch: "morning" });
    const anyTime = await member(first, { batch: "any" });

    // Warn: allowed, with a note.
    let owner = await setBatches(token, "warn", outside, inside);
    const warned = await inGym(owner, (tx) => checkIn(tx, owner, { memberId: morningOutside.id } as never));
    expect(warned.batchNote).toMatch(/Outside batch/);
    const fine = await inGym(owner, (tx) => checkIn(tx, owner, { memberId: anyTime.id } as never));
    expect(fine.batchNote).toBeNull();

    // Enforce: refused for front desk; the owner can override with a reason.
    const eveningMember = await member(first, { batch: "evening" });
    owner = await setBatches(token, "enforce", inside, outside);
    const desk = await staff(owner, "receptionist");
    const refused = await inGym(desk, (tx) => checkIn(tx, desk, { memberId: eveningMember.id } as never)).catch((e) => e);
    expect(code(refused)).toBe("outside_batch");
    const overridden = await inGym(owner, (tx) => checkIn(tx, owner, { memberId: eveningMember.id, overrideReason: "Shift change this week" } as never));
    expect(overridden.overridden).toBe(true);
  });
});

describe("entrance and exit QR", () => {
  beforeEach(resetDb);

  it("checks the scanning member in and out, once, and refuses everyone else", async () => {
    const { ctx: owner, token: ownerTok } = await newGym("Door Gym");
    const { rows } = await q(`select entrance_token, exit_token from gyms where id = $1`, [owner.gym.id]);
    const { entrance_token: entrance, exit_token: exit } = rows[0];
    const m = await member(owner);

    // Exit before entering.
    expect(code(await scanGymCode(m.session, exit).catch((e) => e))).toBe("not_checked_in");
    const inn = await scanGymCode(m.session, entrance);
    expect(inn).toMatchObject({ direction: "in", gymName: "Door Gym", status: "checked_in" });
    expect(code(await scanGymCode(m.session, entrance).catch((e) => e))).toBe("already_checked_in");
    const out = await scanGymCode(m.session, exit);
    expect(out).toMatchObject({ direction: "out", status: "checked_out" });
    expect(await scanGymCode(m.session, exit)).toMatchObject({ status: "already_checked_out" });
    const visit = await q(`select method, check_out_at is not null as out from attendance where member_id = $1`, [m.id]);
    expect(visit.rows).toEqual([{ method: "qr", out: true }]);

    // Unknown code, a member of another gym, staff, and an expired member.
    expect(status(await scanGymCode(m.session, "x".repeat(40)).catch((e) => e))).toBe(404);
    const { ctx: other } = await newGym("Other Gym");
    const outsider = await member(other);
    expect(status(await scanGymCode(outsider.session, entrance).catch((e) => e))).toBe(403);
    const ownerSession = (await resolveSession(ownerTok))!;
    expect(status(await scanGymCode(ownerSession, entrance).catch((e) => e))).toBe(403);
    const lapsed = await member(owner, { active: false });
    expect(code(await scanGymCode(lapsed.session, entrance).catch((e) => e))).toBe("not_allowed_none");
  });
});

describe("live crowd", () => {
  beforeEach(resetDb);

  it("counts who is inside and the usual busy hours for today, without names", async () => {
    const { ctx: owner } = await newGym("Crowd Gym");
    const today = todayIn("Asia/Kolkata");
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) ids.push((await inGym(owner, (tx) => createMember(tx, owner, { ...base, fullName: `Crowd ${i}`, phone: uniquePhone() })))!.id);
    // Today: 3 inside (no check-out, recent), 1 left already.
    for (const [i, out] of [[0, false], [1, false], [2, false], [3, true]] as const) {
      await q(
        `insert into attendance (gym_id, member_id, check_in_at, check_in_date, check_out_at, method) values ($1, $2, now() - interval '20 minutes', $3, $4, 'qr')`,
        [owner.gym.id, ids[i], today, out ? new Date() : null],
      );
    }
    // Same weekday in the last weeks: busy at 7 am and 6 pm.
    for (let w = 1; w <= 3; w++) {
      const day = addDays(today, -7 * w);
      for (const [i, hour] of [[0, 7], [1, 7], [2, 18], [3, 18], [4, 18]] as const) {
        await q(`insert into attendance (gym_id, member_id, check_in_at, check_in_date, method) values ($1, $2, ($3::date + make_interval(hours => $4)) at time zone 'Asia/Kolkata', $3, 'qr')`, [
          owner.gym.id,
          ids[i],
          day,
          hour,
        ]);
      }
    }
    const m = await member(owner);
    const crowd = await inGym(m.ctx, (tx) => gymCrowd(tx, m.ctx));
    expect(crowd.inside).toBe(3);
    expect(crowd.level).toBe("quiet"); // 3 of 40
    expect(crowd.busiestHours).toEqual([7, 18]);
    expect(crowd.byHour.find((h) => h.hour === 18)?.typical).toBe(3);
    expect(JSON.stringify(crowd)).not.toMatch(/Crowd \d/);

    // The assistant gives members the same counts, and the gym's equipment.
    const tools = toolsFor(m.ctx);
    const viaAssistant = (await findTool(tools, "get_gym_crowd")!.run(m.ctx, {} as never)) as { data: { insideNow: number; busiestHours: string[] } };
    expect(viaAssistant.data).toMatchObject({ insideNow: 3, busiestHours: ["7 am", "6 pm"] });
    await inGym(owner, (tx) => addEquipment(tx, owner, equipmentAddSchema.parse({ catalogKey: "leg-press", quantity: 2 })));
    const info = (await findTool(tools, "get_gym_info")!.run(m.ctx, {} as never)) as { data: { equipment: unknown; batches: { morning: string } } };
    expect(info.data.equipment).toEqual([{ name: "Leg press (45°)", quantity: 2, area: "Lower-body machines" }]);
    expect(info.data.batches.morning).toBe("5 am – 11 am");
  });
});
