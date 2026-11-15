import { beforeEach, describe, expect, it } from "vitest";
import { memberListQuery } from "@/shared/schemas/member";
import { inGym, type GymContext } from "@/server/auth/context";
import { AppError } from "@/server/errors";
import { acceptInvite } from "@/server/modules/auth/service";
import { createMember, createMemberInvite, getMember, listMembers, setMemberStatus, updateMember } from "@/server/modules/members/service";
import { inviteStaff } from "@/server/modules/staff/service";
import { contextFor, meta, newGym, resetDb, uniquePhone } from "../support/db";

const base = { email: null, gender: null, dateOfBirth: null, address: null, emergencyContactName: null, emergencyContactPhone: null, notes: null, joinedOn: null, assignedTrainerId: null };
const status = (e: unknown) => (e instanceof AppError ? e.status : String(e));

async function staff(owner: GymContext, role: "trainer" | "receptionist", name: string) {
  const inv = await inGym(owner, (tx) => inviteStaff(tx, owner, { fullName: name, phone: uniquePhone(), email: null, role, specializations: [] }));
  const s = await acceptInvite({ token: inv.inviteUrl.split("/").pop()!, password: "staff-pass-1" }, null, meta);
  return contextFor(s.token!);
}

describe("trainers adding members", () => {
  beforeEach(resetDb);

  it("lets a trainer add a member, who is assigned to that trainer", async () => {
    const { ctx: owner } = await newGym("Coach Gym");
    const tara = await staff(owner, "trainer", "Tara");
    const ravi = await staff(owner, "trainer", "Ravi");

    // Even if a trainer names someone else, the new member is theirs.
    const m = await inGym(tara, (tx) => createMember(tx, tara, { ...base, fullName: "Nimmy Thomas", phone: uniquePhone(), assignedTrainerId: ravi.staffId }));
    expect((await inGym(owner, (tx) => getMember(tx, owner, m!.id))).assignedTrainerId).toBe(tara.staffId);
    const mine = await inGym(tara, (tx) => listMembers(tx, tara, memberListQuery.parse({})));
    expect(mine.items.map((x) => x.fullName)).toEqual(["Nimmy Thomas"]);
    expect((await inGym(ravi, (tx) => listMembers(tx, ravi, memberListQuery.parse({})))).items).toHaveLength(0);

    // They can invite their own member to the app, not someone else's.
    const invite = await inGym(tara, (tx) => createMemberInvite(tx, tara, m!.id));
    expect(invite.inviteUrl).toContain("/invite/");
    expect(status(await inGym(ravi, (tx) => createMemberInvite(tx, ravi, m!.id)).catch((e) => e))).toBe(404);
  });

  it("keeps editing, deactivating and assigning with the front desk and owners", async () => {
    const { ctx: owner } = await newGym("Desk Gym");
    const tara = await staff(owner, "trainer", "Tara");
    const desk = await staff(owner, "receptionist", "Desk");
    const m = await inGym(tara, (tx) => createMember(tx, tara, { ...base, fullName: "Shibin Paul", phone: uniquePhone() }));

    expect(status(await inGym(tara, (tx) => updateMember(tx, tara, m!.id, { fullName: "Changed" } as never)).catch((e) => e))).toBe(403);
    expect(status(await inGym(tara, (tx) => setMemberStatus(tx, tara, m!.id, "inactive")).catch((e) => e))).toBe(403);

    // Front desk still adds members without a trainer, and sees the trainer's member.
    const walkIn = await inGym(desk, (tx) => createMember(tx, desk, { ...base, fullName: "Walk In", phone: uniquePhone() }));
    expect((await inGym(owner, (tx) => getMember(tx, owner, walkIn!.id))).assignedTrainerId).toBeNull();
    const all = await inGym(desk, (tx) => listMembers(tx, desk, memberListQuery.parse({})));
    expect(all.items.map((x) => x.fullName).sort()).toEqual(["Shibin Paul", "Walk In"]);
  });
});
