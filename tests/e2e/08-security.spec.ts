import { expect, request as pwRequest, test, type APIResponse } from "@playwright/test";
import { registerGym, testPhone } from "./helpers";

/**
 * Attacks through the real HTTP API: missing sessions, CSRF, members reaching
 * staff data or each other, trainers outside their members, one gym reaching
 * another, token handling, injection/XSS input and login throttling.
 */

async function ok(res: APIResponse): Promise<any> { // payload shapes vary per call
  expect(res.ok(), `${res.url()}: ${res.status()} ${await res.text()}`).toBeTruthy();
  return ((await res.json()) as { data: unknown }).data;
}

test.describe.configure({ mode: "serial" });

test("tenant, role and session boundaries hold at the API", async ({ page, browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "API-level checks don't depend on the device");
  test.setTimeout(120_000);
  const origin = { origin: baseURL! };

  // Gym A: owner, a plan, two members (one with an account), a trainer.
  await registerGym(page, { gymName: `Secure Gym A ${Date.now() % 100000}` });
  const ownerA = page.request;
  const gymA = (await ok(await ownerA.get("/api/v1/auth/me"))).active.gym.id as string;
  const plan = await ok(await ownerA.post("/api/v1/plans", { headers: origin, data: { name: "Monthly", durationUnit: "months", durationValue: 1, price: "1000", admissionFee: "0" } }));
  const alice = await ok(await ownerA.post("/api/v1/members", { headers: origin, data: { fullName: "Alice Mathew", phone: testPhone(), notes: "STAFF-ONLY NOTE" } }));
  const bob = await ok(await ownerA.post("/api/v1/members", { headers: origin, data: { fullName: "Bob Varghese", phone: testPhone() } }));
  const bobSale = await ok(await ownerA.post("/api/v1/memberships", { headers: origin, data: { memberId: bob.id, planId: plan.id, payment: { amount: "1000", method: "cash" } } }));
  const aliceSale = await ok(await ownerA.post("/api/v1/memberships", { headers: origin, data: { memberId: alice.id, planId: plan.id, payment: { amount: "1000", method: "cash" } } }));
  const invite = await ok(await ownerA.post(`/api/v1/members/${alice.id}/invite`, { headers: origin, data: {} }));
  const trainerInvite = await ok(await ownerA.post("/api/v1/staff", { headers: origin, data: { fullName: "Tara Trainer", phone: testPhone(), role: "trainer" } }));

  // Alice accepts with a cookie session.
  const aliceApi = await pwRequest.newContext({ baseURL });
  const token = new URL(invite.inviteUrl).pathname.split("/").pop();
  await ok(await aliceApi.post("/api/v1/invites/accept", { headers: origin, data: { token, password: "alice-pass-1" } }));
  const tara = await pwRequest.newContext({ baseURL });
  await ok(await tara.post("/api/v1/invites/accept", { headers: origin, data: { token: new URL(trainerInvite.inviteUrl).pathname.split("/").pop(), password: "tara-pass-1" } }));

  // 1. No session → 401 on APIs, redirect on pages.
  const anon = await pwRequest.newContext({ baseURL });
  for (const url of ["/api/v1/members", "/api/v1/payments", "/api/v1/me", `/api/v1/members/${alice.id}/qr-code`, `/api/v1/payments/${bobSale.payment?.id ?? "x"}/receipt`]) {
    expect((await anon.get(url)).status(), url).toBe(401);
  }
  const anonPage = await browser.newPage();
  await anonPage.goto("/me");
  await expect(anonPage).toHaveURL(/\/login/);
  await anonPage.goto("/members");
  await expect(anonPage).toHaveURL(/\/login/);
  await anonPage.close();

  // 2. CSRF: cookie-authenticated writes need a same-site Origin.
  expect((await ownerA.post("/api/v1/members", { data: { fullName: "No Origin", phone: testPhone() } })).status()).toBe(403);
  expect((await ownerA.post("/api/v1/members", { headers: { origin: "https://evil.example" }, data: { fullName: "Evil", phone: testPhone() } })).status()).toBe(403);

  // 3. A member can't use staff APIs or see other members.
  const me = await ok(await aliceApi.get("/api/v1/me"));
  expect(me.member.id).toBe(alice.id);
  expect(JSON.stringify(me)).not.toContain("STAFF-ONLY NOTE");
  const selfRecord = await ok(await aliceApi.get(`/api/v1/members/${alice.id}`));
  expect(selfRecord.notes).toBeUndefined();
  expect(selfRecord.qrToken).toBeUndefined();
  expect((await aliceApi.get(`/api/v1/members/${alice.id}/qr-code`)).status()).toBe(200);
  const bobPayments = await ok(await ownerA.get(`/api/v1/members/${bob.id}/billing`));
  const alicePayments = await ok(await aliceApi.get(`/api/v1/members/${alice.id}/billing`));
  expect((await aliceApi.get(`/api/v1/payments/${alicePayments.payments[0].id}/receipt`)).status()).toBe(200);
  const forbiddenForMember: [string, Promise<APIResponse>][] = [
    ["list members", aliceApi.get("/api/v1/members")],
    ["list payments", aliceApi.get("/api/v1/payments")],
    ["reports", aliceApi.get("/api/v1/reports")],
    ["staff", aliceApi.get("/api/v1/staff")],
    ["dues", aliceApi.get("/api/v1/payments/dues")],
    ["export", aliceApi.get("/api/v1/payments/export")],
    ["other member", aliceApi.get(`/api/v1/members/${bob.id}`)],
    ["other billing", aliceApi.get(`/api/v1/members/${bob.id}/billing`)],
    ["other QR", aliceApi.get(`/api/v1/members/${bob.id}/qr-code`)],
    ["other receipt", aliceApi.get(`/api/v1/payments/${bobPayments.payments[0].id}/receipt`)],
    ["other progress", aliceApi.get(`/api/v1/members/${bob.id}/progress`)],
    ["other logs", aliceApi.get(`/api/v1/members/${bob.id}/workout-logs`)],
    ["create member", aliceApi.post("/api/v1/members", { headers: origin, data: { fullName: "Sneaky", phone: testPhone() } })],
    ["edit self", aliceApi.patch(`/api/v1/members/${alice.id}`, { headers: origin, data: { fullName: "Renamed" } })],
    ["sell membership", aliceApi.post("/api/v1/memberships", { headers: origin, data: { memberId: alice.id, planId: plan.id, payNow: false } })],
    ["record payment", aliceApi.post("/api/v1/payments", { headers: origin, data: { memberId: alice.id, membershipId: aliceSale.membership?.id ?? aliceSale.id, amount: "1", method: "cash" } })],
    ["self check-in", aliceApi.post("/api/v1/attendance/check-in", { headers: origin, data: { memberId: alice.id } })],
    ["generate plan", aliceApi.post("/api/v1/workouts/generate", { headers: origin, data: { memberId: alice.id, mode: "template" } })],
    ["new QR", aliceApi.post(`/api/v1/members/${alice.id}/qr`, { headers: origin, data: {} })],
    ["gym settings", aliceApi.patch("/api/v1/gym/settings", { headers: origin, data: { expiringSoonDays: 1 } })],
  ];
  for (const [name, res] of forbiddenForMember) {
    expect([403, 404], name).toContain((await res).status());
  }

  // 4. Trainers only reach their assigned members and no money.
  const assigned = (await ok(await tara.get("/api/v1/members"))).items as unknown[];
  expect(assigned).toHaveLength(0);
  expect((await tara.get(`/api/v1/members/${bob.id}`)).status()).toBe(404);
  expect((await tara.get("/api/v1/payments")).status()).toBe(403);
  expect((await tara.get(`/api/v1/members/${bob.id}/progress`)).status()).toBe(404);

  // 5. Another gym can't reach gym A, even by naming it.
  const ownerBPage = await browser.newPage();
  await registerGym(ownerBPage, { gymName: `Secure Gym B ${Date.now() % 100000}` });
  const ownerB = ownerBPage.request;
  expect((await ownerB.get(`/api/v1/members/${alice.id}`)).status()).toBe(404);
  expect((await ownerB.get(`/api/v1/payments/${bobPayments.payments[0].id}/receipt`)).status()).toBe(404);
  expect((await ownerB.get("/api/v1/members", { headers: { "x-gym-id": gymA } })).status()).toBe(403);
  expect((await ownerB.post(`/api/v1/members/${bob.id}/invite`, { headers: origin, data: {} })).status()).toBe(404);
  const bList = await ok(await ownerB.get("/api/v1/members?q=Alice"));
  expect(bList.items).toHaveLength(0);
  await ownerBPage.close();

  // 6. Bearer tokens (mobile): work without cookies; garbage is rejected; no secrets leak.
  const mobile = await pwRequest.newContext({ baseURL });
  const login = await ok(await mobile.post("/api/v1/auth/login?client=mobile", { data: { identifier: invite.phone, password: "alice-pass-1" } }));
  expect(login.token).toMatch(/^[A-Za-z0-9_-]{30,}$/);
  const meViaToken = await ok(await mobile.get("/api/v1/auth/me", { headers: { authorization: `Bearer ${login.token}` } }));
  expect(meViaToken.active.role).toBe("member");
  expect(JSON.stringify(meViaToken)).not.toMatch(/password|hash/i);
  expect((await mobile.get("/api/v1/auth/me", { headers: { authorization: "Bearer not-a-real-token" } })).status()).toBe(401);
  await ok(await mobile.post("/api/v1/auth/logout", { headers: { authorization: `Bearer ${login.token}` } }));
  expect((await mobile.get("/api/v1/auth/me", { headers: { authorization: `Bearer ${login.token}` } })).status()).toBe(401);

  // 7. Hostile input is data, not code.
  const injected = await ok(await ownerA.get(`/api/v1/members?q=${encodeURIComponent("' OR 1=1 --")}`));
  expect(injected.items).toHaveLength(0);
  const xss = await ok(await ownerA.post("/api/v1/members", { headers: origin, data: { fullName: `<img src=x onerror="window.__pwned=1">Xavier`, phone: testPhone() } }));
  await page.goto(`/members/${xss.id}`);
  await expect(page.getByRole("heading", { name: /Xavier/ })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();

  // 8. Login throttling per account.
  const brute = await pwRequest.newContext({ baseURL });
  const statuses: number[] = [];
  for (let i = 0; i < 11; i++) {
    statuses.push((await brute.post("/api/v1/auth/login", { headers: origin, data: { identifier: invite.phone, password: `wrong-${i}` } })).status());
  }
  // 10 attempts per account per 15 minutes (the mobile login above used one).
  const firstBlocked = statuses.indexOf(429);
  expect(firstBlocked, statuses.join(",")).toBeGreaterThanOrEqual(5);
  expect(statuses.slice(0, firstBlocked).every((s) => s === 401)).toBe(true);
  expect(statuses.slice(firstBlocked).every((s) => s === 429)).toBe(true);
  // While locked, even the right password is refused.
  expect((await brute.post("/api/v1/auth/login", { headers: origin, data: { identifier: invite.phone, password: "alice-pass-1" } })).status()).toBe(429);

  // 9. Headers and cookies.
  const res = await anon.get("/login");
  const h = res.headers();
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  const cookieLogin = await anon.post("/api/v1/auth/login", { headers: origin, data: { identifier: "nobody@example.com", password: "x" } });
  expect(cookieLogin.status()).toBe(401);
  const cookies = await page.context().cookies();
  const session = cookies.find((c) => c.name === "fito_session")!;
  expect(session.httpOnly).toBe(true);
  expect(session.sameSite).toBe("Lax");

  for (const ctx of [aliceApi, tara, anon, mobile, brute]) await ctx.dispose();
});
