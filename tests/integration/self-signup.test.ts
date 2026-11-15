import { beforeEach, describe, expect, it } from "vitest";
import { inGym, resolveGymContext, type GymContext } from "@/server/auth/context";
import { resolveSession } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { joinGym, registerMember, searchJoinableGyms } from "@/server/modules/auth/member-signup";
import { updateGymSettings } from "@/server/modules/gyms/service";
import { createMember, getMember } from "@/server/modules/members/service";
import { listNotifications } from "@/server/modules/notifications/service";
import { adminPool, meta, newGym, resetDb, uniquePhone } from "../support/db";

const status = (e: unknown) => (e instanceof AppError ? e.status : String(e));
const signup = (phone = uniquePhone(), fullName = "Asha Nair") => registerMember({ fullName, phone, email: null, password: "member-pass-1" }, meta);
const sessionOf = async (token: string) => (await resolveSession(token))!;

async function closeSignups(ctx: GymContext) {
  await inGym(ctx, (tx) =>
    updateGymSettings(tx, ctx, { expiringSoonDays: 7, sessionMinutes: 90, openingHours: null, availableEquipment: [], allowMemberSignup: false }),
  );
}

describe("member self sign-up", () => {
  beforeEach(resetDb);

  it("creates an account with no gym yet and refuses duplicate numbers", async () => {
    const phone = uniquePhone();
    const s = await signup(phone);
    const session = await sessionOf(s.token);
    expect((await resolveGymContext(session)).kind).toBe("none");
    expect(status(await signup(phone).catch((e) => e))).toBe(409);
  });

  it("finds only gyms open to sign-ups, by name or city, with wildcards treated as text", async () => {
    const open = await newGym("Muscle Garage Aluva");
    const closed = await newGym("Private Studio Aluva");
    await closeSignups(closed.ctx);
    const session = await sessionOf((await signup()).token);

    const names = async (q: string) => (await searchJoinableGyms(session, q)).map((g) => g.name);
    expect(await names("aluva")).toEqual(["Muscle Garage Aluva"]);
    expect(await names("Kochi")).toContain("Muscle Garage Aluva"); // city
    expect(await names("%")).toEqual([]);
    expect(await names("Private")).toEqual([]);
    expect(open.ctx.gym.id).toBeTruthy();
  });

  it("joins a gym as a member without a membership, tells the front desk, and is idempotent", async () => {
    const { ctx: owner } = await newGym("Join Gym");
    const s = await signup(uniquePhone(), "Rahul Menon");
    const session = await sessionOf(s.token);
    const joined = await joinGym(session, owner.gym.id);
    expect(joined.created).toBe(true);

    const member = await inGym(owner, (tx) => getMember(tx, owner, joined.memberId));
    expect(member).toMatchObject({ fullName: "Rahul Menon", standing: "none", hasAccount: true, memberCode: "M0001" });
    const notes = await inGym(owner, (tx) => listNotifications(tx, owner));
    expect(notes.items[0]?.title).toContain("New member joined from the app: Rahul Menon");

    // The session now points at the gym, as a member.
    const after = await resolveGymContext(await sessionOf(s.token));
    expect(after.kind === "ok" && after.ctx.role).toBe("member");

    const again = await joinGym(session, owner.gym.id);
    expect(again).toMatchObject({ created: false, memberId: joined.memberId });
    const count = await adminPool().query(`select count(*)::int as n from members where gym_id = $1`, [owner.gym.id]);
    expect(count.rows[0].n).toBe(1);
  });

  it("never takes over a register entry with the same number, and respects closed gyms", async () => {
    const { ctx: owner } = await newGym("Careful Gym");
    const phone = uniquePhone();
    await inGym(owner, (tx) =>
      createMember(tx, owner, { fullName: "Real Person", phone, email: null, gender: null, dateOfBirth: null, address: null, emergencyContactName: null, emergencyContactPhone: null, notes: null, joinedOn: null, assignedTrainerId: null }),
    );
    const session = await sessionOf((await signup(phone, "Someone Else")).token);
    const err = await joinGym(session, owner.gym.id).catch((e) => e);
    expect(status(err)).toBe(409);
    expect((err as Error).message).toContain("invite link");
    const linked = await adminPool().query(`select count(*)::int as n from members where gym_id = $1 and user_id is not null`, [owner.gym.id]);
    expect(linked.rows[0].n).toBe(0);

    const closed = await newGym("Closed Gym");
    await closeSignups(closed.ctx);
    expect(status(await joinGym(session, closed.ctx.gym.id).catch((e) => e))).toBe(404);
  });

  it("lets a member join a second gym and switch between them", async () => {
    const a = await newGym("First Gym");
    const b = await newGym("Second Gym");
    const s = await signup();
    let session = await sessionOf(s.token);
    await joinGym(session, a.ctx.gym.id);
    session = await sessionOf(s.token);
    await joinGym(session, b.ctx.gym.id);
    session = await sessionOf(s.token);

    const now = await resolveGymContext(session);
    expect(now.kind === "ok" && now.ctx.gym.name).toBe("Second Gym");
    expect(now.kind === "ok" && now.ctx.memberships.map((m) => m.gymName).sort()).toEqual(["First Gym", "Second Gym"]);
    const searched = await searchJoinableGyms(session, "Gym");
    expect(searched.filter((g) => g.joined).map((g) => g.name).sort()).toEqual(["First Gym", "Second Gym"]);

    // Switching back is the existing gym switch (explicit gym id).
    const back = await resolveGymContext(session, a.ctx.gym.id);
    expect(back.kind === "ok" && back.ctx.role).toBe("member");
  });
});
