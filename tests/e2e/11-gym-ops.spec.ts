import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, expect, test, type APIRequestContext, type Browser, type TestInfo } from "@playwright/test";
import { expectNoSideScroll, registerGym, testPhone, writeQrVideo } from "./helpers";

async function call(request: APIRequestContext, baseURL: string, url: string, data: unknown) {
  const res = await request.post(url, { data, headers: { origin: baseURL } });
  expect(res.ok(), `${url}: ${await res.text()}`).toBeTruthy();
  return (await res.json()).data;
}

/** A second browser session on the same device profile. */
async function session(browser: Browser, info: TestInfo, baseURL: string) {
  const { viewport, userAgent, isMobile, hasTouch, deviceScaleFactor } = info.project.use;
  const ctx = await browser.newContext({ viewport, userAgent, isMobile, hasTouch, deviceScaleFactor, baseURL, timezoneId: "Asia/Kolkata" });
  return ctx.newPage();
}

/** Gym-local (IST) hour now. */
const istHour = () => new Date(Date.now() + 5.5 * 3600_000).getUTCHours();

test("members check themselves in and out with the entrance and exit QR, and see how busy the gym is", async ({ page, browser, baseURL }, info) => {
  test.setTimeout(120_000);
  await registerGym(page, { gymName: `Door Gym ${info.project.name} ${Date.now() % 100000}` });
  const req = page.request;
  const plan = await call(req, baseURL!, "/api/v1/plans", { name: "Monthly", durationUnit: "months", durationValue: 1, price: "1000", admissionFee: "0" });
  const phone = testPhone();
  const member = await call(req, baseURL!, "/api/v1/members", { fullName: "Door Divya", phone });
  await call(req, baseURL!, "/api/v1/memberships", { memberId: member.id, planId: plan.id, payNow: false });
  const invite = await call(req, baseURL!, `/api/v1/members/${member.id}/invite`, {});

  // The member sets up their account, then signs out (phones remember nothing).
  const m = await session(browser, info, baseURL!);
  await m.goto(new URL(invite.inviteUrl).pathname);
  await m.getByLabel("Choose a password").fill("member-pass");
  await m.getByRole("button", { name: /Create account/ }).click();
  await expect(m).toHaveURL(/\/me$/);
  await m.context().clearCookies();

  // Owner prints the posters.
  await page.goto("/attendance");
  await page.getByRole("link", { name: /Entrance & exit QR/ }).click();
  await expect(page.getByRole("heading", { name: "Entrance & exit QR" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Entrance QR code" })).toBeVisible();
  const entrance = new URL((await page.getByTestId("url-entrance").textContent())!).pathname;
  const exit = new URL((await page.getByTestId("url-exit").textContent())!).pathname;
  await expectNoSideScroll(page);

  // Scanning the entrance code while signed out: sign in, then straight back to the check-in.
  await m.goto(entrance);
  await expect(m).toHaveURL(/\/login\?next=/);
  await expect(m.getByText("Sign in to check in at your gym.")).toBeVisible();
  await m.getByLabel("Email or phone").fill(phone);
  await m.getByLabel("Password").fill("member-pass");
  await m.getByRole("button", { name: "Sign in" }).click();
  await expect(m.getByRole("heading", { name: "You're checked in" })).toBeVisible();
  await expect(m.getByText(/Entrance · Door Gym/)).toBeVisible();
  await expectNoSideScroll(m);

  // The home screen counts them inside.
  await m.goto("/me");
  await expect(m.getByTestId("crowd-inside")).toHaveText("1");
  await expect(m.getByTestId("crowd-level")).toHaveText("Quiet");

  // Second scan of the entrance: once a day.
  await m.goto(entrance);
  await expect(m.getByRole("heading", { name: "Already checked in" })).toBeVisible();

  // Exit code checks them out; again is harmless.
  await m.goto(exit);
  await expect(m.getByRole("heading", { name: "Checked out. Great session!" })).toBeVisible();
  await m.goto(exit);
  await expect(m.getByRole("heading", { name: "Already checked out" })).toBeVisible();
  await m.goto("/me");
  await expect(m.getByTestId("crowd-inside")).toHaveText("0");

  // The front desk sees it in today's attendance, marked as a door scan.
  await page.goto("/attendance");
  await expect(page.getByText("Door Divya")).toBeVisible();
  if (info.project.name === "desktop") await expect(page.getByText("Door QR", { exact: true })).toBeVisible();

  // Replacing the codes retires the printed ones.
  await page.goto("/attendance/codes");
  await page.getByRole("button", { name: "Replace codes" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Replace codes" }).click();
  await expect(page.getByText("New codes ready")).toBeVisible();
  await m.goto(entrance);
  await expect(m.getByText(/isn't valid any more/)).toBeVisible();

  // Staff scanning a door code are told to use Attendance instead.
  await page.goto(new URL((await page.getByTestId("url-entrance").textContent())!).pathname);
  await expect(page.getByText(/These codes are for members/)).toBeVisible();
});

test("the member's in-app scanner reads the entrance poster with the camera", async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "Camera emulation runs once (desktop project)");
  test.setTimeout(120_000);
  await registerGym(page, { gymName: `Camera Door Gym ${Date.now() % 100000}` });
  const req = page.request;
  const plan = await call(req, baseURL!, "/api/v1/plans", { name: "Monthly", durationUnit: "months", durationValue: 1, price: "1000", admissionFee: "0" });
  const member = await call(req, baseURL!, "/api/v1/members", { fullName: "Lens Lakshmi", phone: testPhone() });
  await call(req, baseURL!, "/api/v1/memberships", { memberId: member.id, planId: plan.id, payNow: false });
  const invite = await call(req, baseURL!, `/api/v1/members/${member.id}/invite`, {});
  const codes = (await (await req.get("/api/v1/gym/scan-codes")).json()).data as { entranceUrl: string };

  mkdirSync(info.outputDir, { recursive: true });
  const video = path.join(info.outputDir, "entrance.y4m");
  writeQrVideo(video, codes.entranceUrl);
  const cam = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${video}`] });
  const ctx = await cam.newContext({ baseURL, permissions: ["camera"], viewport: { width: 420, height: 860 } });
  const m = await ctx.newPage();
  await m.goto(new URL(invite.inviteUrl).pathname);
  await m.getByLabel("Choose a password").fill("member-pass");
  await m.getByRole("button", { name: /Create account/ }).click();
  await expect(m).toHaveURL(/\/me$/);
  await m.getByRole("link", { name: "Scan gym QR" }).click();
  await m.getByRole("button", { name: "Open camera" }).click();
  await expect(m.getByRole("heading", { name: "You're checked in" })).toBeVisible({ timeout: 15000 });
  await expect(m.getByLabel("Camera preview")).toBeHidden();
  await cam.close();
});

test("owners and trainers keep the equipment list; the front desk can only look", async ({ page, browser, baseURL }, info) => {
  test.setTimeout(120_000);
  await registerGym(page, { gymName: `Kit Gym ${info.project.name} ${Date.now() % 100000}` });
  await page.goto("/equipment");
  await expect(page.getByText("No equipment listed yet")).toBeVisible();

  // Search the catalogue, set a quantity, add.
  const search = page.getByLabel("Search equipment catalogue");
  await search.fill("leg press");
  const results = page.getByTestId("catalogue-results");
  await expect(results.getByText("Leg press (45°)")).toBeVisible();
  await results.getByLabel("Quantity of Leg press (45°)").fill("2");
  await results.getByRole("listitem").filter({ hasText: "Leg press (45°)" }).getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Leg press (45°) added")).toBeVisible();
  await search.fill("treadmill");
  await results.getByRole("listitem").filter({ hasText: /^Treadmill/ }).getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Treadmill added")).toBeVisible();

  // Steppers save straight away.
  await page.getByRole("button", { name: "One more Leg press (45°)" }).click();
  await expect(page.getByLabel("How many: Leg press (45°)")).toHaveValue("3");
  await page.getByLabel("How many: Treadmill").fill("6");
  await page.getByLabel("How many: Treadmill").press("Enter");
  await expect(page.getByText("Pieces in total").locator("..").locator("..")).toContainText("9");
  await page.reload();
  await expect(page.getByLabel("How many: Leg press (45°)")).toHaveValue("3");
  await expect(page.getByLabel("How many: Treadmill")).toHaveValue("6");

  // Something the catalogue doesn't have.
  await search.fill("hammer strength iso row");
  await page.getByRole("button", { name: /Add .hammer strength iso row. as your own item/ }).click();
  await expect(page.getByLabel("Name")).toHaveValue("hammer strength iso row");
  await page.getByLabel("Name").fill("Hammer Strength iso row");
  await page.getByLabel("Counts as").selectOption("machine");
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page.getByText("Hammer Strength iso row added")).toBeVisible();
  await page.getByRole("button", { name: "Remove Hammer Strength iso row" }).click();
  await expect(page.getByText("Hammer Strength iso row removed")).toBeVisible();
  await expect(page.getByTestId("equipment-row")).toHaveCount(2);
  await expectNoSideScroll(page);

  // Front desk: read-only.
  const invite = await call(page.request, baseURL!, "/api/v1/staff", { fullName: "Desk Deepa", phone: testPhone(), role: "receptionist", specializations: [] });
  const d = await session(browser, info, baseURL!);
  await d.goto(new URL(invite.inviteUrl).pathname);
  await d.getByLabel("Choose a password").fill("desk-pass-1");
  await d.getByRole("button", { name: "Create account and join" }).click();
  await expect(d).toHaveURL(/\/dashboard/);
  await d.goto("/equipment");
  await expect(d.getByText("× 3")).toBeVisible();
  await expect(d.getByLabel("Search equipment catalogue")).toHaveCount(0);
  await expect(d.getByRole("button", { name: /Remove/ })).toHaveCount(0);
  const denied = await d.request.post("/api/v1/equipment", { data: { catalogKey: "rowing-machine" }, headers: { origin: baseURL! } });
  expect(denied.status()).toBe(403);
});

test("members have a batch; the list filters by it and check-ins outside it are flagged", async ({ page, browser, baseURL }, info) => {
  test.setTimeout(120_000);
  await registerGym(page, { gymName: `Batch Gym ${info.project.name} ${Date.now() % 100000}` });

  // Morning batch hours that don't include now, so a check-in now is outside it.
  const window = istHour() >= 4 ? ["00:00", "02:00"] : ["05:00", "06:00"];
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Morning from").fill(window[0]!);
  await page.getByLabel("Morning until").fill(window[1]!);
  await page.getByLabel("When someone comes outside their batch").selectOption("warn");
  await page.getByLabel("Comfortable capacity (people at once)").fill("25");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Morning from")).toHaveValue(window[0]!);
  await expect(page.getByLabel("Comfortable capacity (people at once)")).toHaveValue("25");

  // Add a morning-batch member with the form.
  await page.goto("/members/new");
  await page.getByLabel("Full name").fill("Batch Bindu");
  await page.getByLabel("Mobile number").fill(testPhone());
  await page.getByLabel("Batch").selectOption("morning");
  await page.getByRole("button", { name: "Add member" }).click();
  await expect(page.getByText("Batch Bindu added")).toBeVisible();
  const req = page.request;
  const list = (await (await req.get("/api/v1/members?q=Bindu")).json()).data.items as { id: string; batch: string }[];
  expect(list[0]?.batch).toBe("morning");
  const plan = await call(req, baseURL!, "/api/v1/plans", { name: "Monthly", durationUnit: "months", durationValue: 1, price: "1000", admissionFee: "0" });
  await call(req, baseURL!, "/api/v1/memberships", { memberId: list[0]!.id, planId: plan.id, payNow: false });
  await call(req, baseURL!, "/api/v1/members", { fullName: "Evening Eby", phone: testPhone(), batch: "evening" });

  // The profile and the list show it; the filter narrows by it.
  await page.goto(`/members/${list[0]!.id}`);
  await expect(page.getByText(/Morning · /)).toBeVisible();
  await page.goto("/members");
  const batchNav = page.getByRole("navigation", { name: "Filter by batch" });
  await batchNav.getByRole("link", { name: "Morning" }).click();
  await expect(page).toHaveURL(/batch=morning/);
  await expect(page.getByText("Batch Bindu").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Evening Eby")).toHaveCount(0);
  await batchNav.getByRole("link", { name: "Evening" }).click();
  await expect(page.getByText("Evening Eby").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Batch Bindu")).toHaveCount(0);
  await expectNoSideScroll(page);

  // Front desk checks Bindu in by name now: allowed, with a warning.
  await page.goto("/attendance/scan");
  // A slow search never leaves the previous person's "Check in" button on screen.
  await page.getByLabel("Search member").fill("Eby");
  await expect(page.getByText("Evening Eby")).toBeVisible();
  await page.route("**/api/v1/attendance/search*", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.getByLabel("Search member").fill("Bindu");
  await expect(page.getByText("Searching…")).toBeVisible();
  await expect(page.getByText("Evening Eby")).toHaveCount(0);
  await page.unroute("**/api/v1/attendance/search*");
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Batch Bindu" })).toContainText("Outside batch");

  // With "enforce", a second member outside their batch is refused at the door code.
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("When someone comes outside their batch").selectOption("enforce");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  const mPhone = testPhone();
  const strict = await call(req, baseURL!, "/api/v1/members", { fullName: "Strict Sunil", phone: mPhone, batch: "morning" });
  await call(req, baseURL!, "/api/v1/memberships", { memberId: strict.id, planId: plan.id, payNow: false });
  const invite = await call(req, baseURL!, `/api/v1/members/${strict.id}/invite`, {});
  const m = await session(browser, info, baseURL!);
  await m.goto(new URL(invite.inviteUrl).pathname);
  await m.getByLabel("Choose a password").fill("member-pass");
  await m.getByRole("button", { name: /Create account/ }).click();
  await expect(m).toHaveURL(/\/me$/);
  await expect(m.getByText(/Your batch: Morning/)).toBeVisible();
  const codes = (await (await req.get("/api/v1/gym/scan-codes")).json()).data as { entranceUrl: string };
  await m.goto(new URL(codes.entranceUrl).pathname);
  await expect(m.getByText(/Please come during your batch/)).toBeVisible();
});

test("members can see the gym's equipment, and the crowd card works on phones", async ({ page, browser, baseURL }, info) => {
  await registerGym(page, { gymName: `Look Gym ${info.project.name} ${Date.now() % 100000}` });
  const req = page.request;
  await call(req, baseURL!, "/api/v1/equipment", { catalogKey: "spin-bike", quantity: 8 });
  const member = await call(req, baseURL!, "/api/v1/members", { fullName: "Viewer Vinu", phone: testPhone() });
  const invite = await call(req, baseURL!, `/api/v1/members/${member.id}/invite`, {});
  const m = await session(browser, info, baseURL!);
  await m.goto(new URL(invite.inviteUrl).pathname);
  await m.getByLabel("Choose a password").fill("member-pass");
  await m.getByRole("button", { name: /Create account/ }).click();
  await expect(m.getByTestId("crowd-card")).toBeVisible();
  await expect(m.getByTestId("crowd-level")).toHaveText("Empty");
  await expect(m.getByText("Busy-hour patterns appear after a few weeks of check-ins.")).toBeVisible();
  await expectNoSideScroll(m);
  await m.getByRole("link", { name: "See gym equipment" }).click();
  await expect(m.getByRole("heading", { name: /Equipment at Look Gym/ })).toBeVisible();
  await expect(m.getByText("Spin bike")).toBeVisible();
  await expect(m.getByText("× 8")).toBeVisible();
  await expectNoSideScroll(m);
  // Members can't change it.
  const denied = await m.request.post("/api/v1/equipment", { data: { catalogKey: "rowing-machine" }, headers: { origin: baseURL! } });
  expect(denied.status()).toBe(403);
});
