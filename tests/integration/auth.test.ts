import { beforeEach, describe, expect, it } from "vitest";
import { inGym } from "@/server/auth/context";
import { resolveSession } from "@/server/auth/session";
import { acceptInvite, changePassword, login, lookupInvite, registerGymOwner, resetPassword } from "@/server/modules/auth/service";
import { createPasswordResetLink, inviteStaff, listStaff, updateStaff } from "@/server/modules/staff/service";
import { AppError } from "@/server/errors";
import { contextFor, meta, newGym, resetDb, uniquePhone } from "../support/db";

function tokenFromUrl(url: string) {
  return url.split("/").pop()!;
}

describe("registration and login", () => {
  beforeEach(resetDb);

  it("registers an owner with a gym and signs in by phone or email", async () => {
    const { ctx, phone } = await newGym("Iron Paradise");
    expect(ctx.role).toBe("owner");
    expect(ctx.gym.name).toBe("Iron Paradise");
    expect(ctx.gym.receiptPrefix).toBe("IP");

    const byPhone = await login({ identifier: phone.replace("+91", ""), password: "password123" }, meta);
    expect(byPhone.userId).toBe(ctx.user.id);

    await registerGymOwner(
      { fullName: "Asha", email: "asha@example.com", phone: null, password: "password123", gymName: "Asha Fit", city: "Thrissur", accessCode: null },
      meta,
    );
    const byEmail = await login({ identifier: "ASHA@example.com", password: "password123" }, meta);
    expect(byEmail.token).toHaveLength(43);
  });

  it("rejects wrong passwords and unknown accounts with the same message", async () => {
    const { phone } = await newGym();
    const wrong = await login({ identifier: phone, password: "nope-nope" }, meta).catch((e) => e);
    const unknown = await login({ identifier: "+919000000001", password: "password123" }, meta).catch((e) => e);
    expect(wrong).toBeInstanceOf(AppError);
    expect((wrong as AppError).status).toBe(401);
    expect((unknown as AppError).message).toBe((wrong as AppError).message);
  });

  it("refuses a second account with the same phone", async () => {
    const { phone } = await newGym();
    const err = await registerGymOwner(
      { fullName: "Dup", email: null, phone, password: "password123", gymName: "Dup Gym", city: "Kochi", accessCode: null },
      meta,
    ).catch((e) => e);
    expect((err as AppError).status).toBe(409);
  });

  it("rate-limits repeated failed logins", async () => {
    const { phone } = await newGym();
    for (let i = 0; i < 10; i++) await login({ identifier: phone, password: "bad-password" }, meta).catch(() => undefined);
    const err = await login({ identifier: phone, password: "password123" }, meta).catch((e) => e);
    expect((err as AppError).status).toBe(429);
  });
});

describe("staff invites, roles and resets", () => {
  beforeEach(resetDb);

  it("invites a trainer who creates an account and joins the gym", async () => {
    const owner = await newGym("Pulse Gym");
    const phone = uniquePhone();
    const invite = await inGym(owner.ctx, (tx) =>
      inviteStaff(tx, owner.ctx, { fullName: "Ravi Trainer", phone, email: null, role: "trainer", specializations: ["Strength"] }),
    );
    const token = tokenFromUrl(invite.inviteUrl);
    const info = await lookupInvite(token);
    expect(info).toMatchObject({ kind: "staff", gymName: "Pulse Gym", role: "trainer", expired: false, accepted: false });

    const accepted = await acceptInvite({ token, password: "trainer-pass", fullName: "Ravi T" }, null, meta);
    const trainerCtx = await contextFor(accepted.token!);
    expect(trainerCtx.role).toBe("trainer");
    expect(trainerCtx.permissions.has("staff.manage")).toBe(false);

    // The link only works once: the token is cleared on acceptance.
    const again = await acceptInvite({ token, password: "trainer-pass" }, null, meta).catch((e) => e);
    expect((again as AppError).status).toBe(404);

    const staff = await inGym(owner.ctx, (tx) => listStaff(tx, owner.ctx));
    expect(staff.find((s) => s.fullName === "Ravi Trainer")?.status).toBe("active");
  });

  it("stops managers from creating owners and keeps at least one owner", async () => {
    const owner = await newGym();
    const inv = await inGym(owner.ctx, (tx) =>
      inviteStaff(tx, owner.ctx, { fullName: "Mia Manager", phone: uniquePhone(), email: null, role: "manager", specializations: [] }),
    );
    const mgr = await acceptInvite({ token: tokenFromUrl(inv.inviteUrl), password: "manager-pass" }, null, meta);
    const mgrCtx = await contextFor(mgr.token!);

    const err = await inGym(mgrCtx, (tx) =>
      inviteStaff(tx, mgrCtx, { fullName: "X", phone: uniquePhone(), email: null, role: "owner", specializations: [] }),
    ).catch((e) => e);
    expect((err as AppError).status).toBe(403);

    const ownerStaffId = owner.ctx.staffId!;
    const demote = await inGym(owner.ctx, (tx) => updateStaff(tx, owner.ctx, ownerStaffId, { role: "manager" } as never)).catch(
      (e) => e,
    );
    expect((demote as AppError).message).toMatch(/at least one active owner/);
  });

  it("issues a one-time password reset link that signs the user out everywhere", async () => {
    const owner = await newGym();
    const inv = await inGym(owner.ctx, (tx) =>
      inviteStaff(tx, owner.ctx, { fullName: "Desk", phone: uniquePhone(), email: null, role: "receptionist", specializations: [] }),
    );
    const desk = await acceptInvite({ token: tokenFromUrl(inv.inviteUrl), password: "desk-pass-1" }, null, meta);
    const deskCtx = await contextFor(desk.token!);

    const reset = await inGym(owner.ctx, (tx) => createPasswordResetLink(tx, owner.ctx, { kind: "staff", id: deskCtx.staffId! }));
    await resetPassword(tokenFromUrl(reset.url), "desk-pass-2", meta);
    expect(await resolveSession(desk.token)).toBeNull();

    const reuse = await resetPassword(tokenFromUrl(reset.url), "desk-pass-3", meta).catch((e) => e);
    expect((reuse as AppError).status).toBe(400);
  });

  it("changes password only with the current password", async () => {
    const owner = await newGym();
    const session = (await resolveSession(owner.token))!;
    const bad = await changePassword(session, { currentPassword: "wrong", newPassword: "new-password" }).catch((e) => e);
    expect((bad as AppError).status).toBe(400);
    await changePassword(session, { currentPassword: "password123", newPassword: "new-password" });
    const ok = await login({ identifier: owner.phone, password: "new-password" }, meta);
    expect(ok.userId).toBe(owner.ctx.user.id);
  });
});
