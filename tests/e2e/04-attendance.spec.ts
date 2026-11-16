import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, expect, test, type APIRequestContext } from "@playwright/test";
import { Client } from "pg";
import { expectNoSideScroll, registerGym, testPhone, writeQrVideo } from "./helpers";

const ADMIN_DB = process.env.E2E_DATABASE_ADMIN_URL ?? "postgres://postgres@localhost:5432/fito";

async function post(request: APIRequestContext, baseURL: string, url: string, data: unknown) {
  const res = await request.post(url, { data, headers: { origin: baseURL } });
  expect(res.ok(), `${url}: ${await res.text()}`).toBeTruthy();
  return (await res.json()).data;
}

test("front desk checks members in with the camera, a handheld scanner and by name", async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "Camera emulation runs once (desktop project)");
  await registerGym(page, { gymName: `Scan Gym ${Date.now() % 100000}` });
  const req = page.request;
  const plan = await post(req, baseURL!, "/api/v1/plans", { name: "Monthly", durationUnit: "months", durationValue: 1, price: "1000", admissionFee: "0", isActive: true });
  const active = await post(req, baseURL!, "/api/v1/members", { fullName: "Camera Kavya", phone: testPhone() });
  await post(req, baseURL!, "/api/v1/memberships", { memberId: active.id, planId: plan.id, payNow: false });
  const lapsed = await post(req, baseURL!, "/api/v1/members", { fullName: "Lapsed Lijo", phone: testPhone() });
  await post(req, baseURL!, "/api/v1/memberships", { memberId: lapsed.id, planId: plan.id, payNow: false, startDate: "2024-01-01" });

  // The member page shows their QR code
  await page.goto(`/members/${active.id}`);
  await expect(page.getByRole("img", { name: "Check-in QR code for Camera Kavya" })).toBeVisible();
  const svg = await req.get(`/api/v1/members/${active.id}/qr-code`);
  expect(svg.headers()["content-type"]).toContain("image/svg+xml");

  const db = new Client({ connectionString: ADMIN_DB });
  await db.connect();
  const { rows } = await db.query("select qr_token from members where id = $1", [active.id]);
  await db.end();
  const payload = `FITO1:${rows[0].qr_token}`;
  mkdirSync(info.outputDir, { recursive: true });
  const video = path.join(info.outputDir, "qr.y4m");
  writeQrVideo(video, payload);

  // A browser whose camera "sees" the member's QR code
  const browser = await chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${video}`],
  });
  const ctx = await browser.newContext({ baseURL, storageState: await page.context().storageState(), permissions: ["camera"], viewport: { width: 1280, height: 860 } });
  const scanner = await ctx.newPage();
  await scanner.goto("/attendance/scan");
  await scanner.getByRole("button", { name: "Start camera" }).click();
  await expect(scanner.getByRole("status").filter({ hasText: "Camera Kavya" })).toBeVisible({ timeout: 15000 });
  await expect(scanner.getByText(/Checked in · M\d{4}/)).toBeVisible();

  // Handheld scanner (keyboard wedge): same code again is refused as a duplicate
  await scanner.getByRole("button", { name: "Stop camera" }).click();
  await scanner.getByLabel("Scanner input").fill(payload);
  await scanner.getByLabel("Scanner input").press("Enter");
  await expect(scanner.getByRole("alert").filter({ hasText: "already checked in today" })).toBeVisible();

  // By name: an expired member is refused, then let in with an owner override
  await scanner.getByLabel("Search member").fill("Lijo");
  await scanner.getByRole("button", { name: "Check in" }).click();
  await expect(scanner.getByRole("alert").filter({ hasText: /Expired/ })).toBeVisible();
  await scanner.getByLabel(/Let Lapsed Lijo in anyway/).fill("Renewing at the desk");
  await scanner.getByRole("button", { name: "Check in with override" }).click();
  await expect(scanner.getByText("Checked in (override)", { exact: false })).toBeVisible();
  await browser.close();

  // Attendance log shows both; check one out
  await page.goto("/attendance");
  await expect(page.getByText("Camera Kavya").first()).toBeVisible();
  await expect(page.getByText("Override: Renewing at the desk")).toBeVisible();
  await page.getByRole("button", { name: "Actions for Camera Kavya's check-in" }).click();
  await page.getByRole("menuitem", { name: "Check out" }).click();
  await expect(page.getByText("Camera Kavya checked out")).toBeVisible();

  // Reports
  await page.goto("/reports");
  await expect(page.getByText("Renewal rate")).toBeVisible();
  await expect(page.getByText("2 different members")).toBeVisible();
  await expect(page.getByRole("img", { name: "Check-ins by hour of day" })).toBeVisible();
});

test("attendance and reports pages work on phones", async ({ page }, info) => {
  await registerGym(page, { gymName: `Phone Gym ${info.project.name} ${Date.now() % 100000}` });
  await page.goto("/attendance");
  await expect(page.getByText("No check-ins")).toBeVisible();
  await expectNoSideScroll(page);
  await page.goto("/attendance/scan");
  await expect(page.getByRole("button", { name: "Start camera" })).toBeVisible();
  await expectNoSideScroll(page);
  await page.goto("/reports");
  await expect(page.getByText("Members today")).toBeVisible();
  await expectNoSideScroll(page);
});
