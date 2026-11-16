import { expect, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { Client } from "pg";
import QRCode from "qrcode";

/**
 * The suite registers more gyms than FITO's real limit (10 per IP per hour).
 * Clear that counter before each test registration; production is unchanged.
 */
async function resetRegistrationLimit() {
  const client = new Client({ connectionString: process.env.E2E_DATABASE_ADMIN_URL ?? "postgres://postgres@localhost:5432/fito" });
  await client.connect();
  try {
    await client.query("delete from rate_limits where key like 'register:%' or key like 'login:%'");
  } finally {
    await client.end();
  }
}

let counter = 0;
/** Unique Indian mobile number per call, so tests don't collide across runs. */
export function testPhone(): string {
  counter += 1;
  const base = (Date.now() % 1_000_000).toString().padStart(6, "0");
  return `9${base}${String(counter).padStart(3, "0")}`;
}

export async function registerGym(page: Page, opts: { gymName: string; ownerName?: string; phone?: string }) {
  const phone = opts.phone ?? testPhone();
  await resetRegistrationLimit();
  await page.goto("/register");
  await page.getByLabel("Gym name").fill(opts.gymName);
  await page.getByLabel("City").fill("Kochi");
  await page.getByLabel("Your name").fill(opts.ownerName ?? "Test Owner");
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create gym account" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  return { phone, password: "password123" };
}

export async function signIn(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email or phone").fill(identifier);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Opens the navigation on small screens (the sidebar is hidden there). */
export async function openNav(page: Page) {
  const menu = page.getByRole("button", { name: "Open menu" });
  if (await menu.isVisible()) await menu.click();
}

export async function navigate(page: Page, label: string) {
  await openNav(page);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: label, exact: true }).first().click();
}

/**
 * Fails if the page scrolls sideways. Compares against the configured viewport
 * width: on emulated phones the layout viewport (innerWidth) grows to fit
 * overflowing content, so innerWidth alone would hide the bug.
 */
export async function expectNoSideScroll(page: Page) {
  const device = page.viewportSize()!.width;
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scroll, `page is ${scroll - device}px wider than the ${device}px screen`).toBeLessThanOrEqual(device + 1);
}

/** Writes a Y4M video (what Chromium's fake camera reads) showing a QR code. */
export function writeQrVideo(file: string, text: string) {
  const W = 640;
  const H = 480;
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const quiet = 4;
  const scale = Math.floor(360 / (n + quiet * 2));
  const size = (n + quiet * 2) * scale;
  const x0 = Math.floor((W - size) / 2);
  const y0 = Math.floor((H - size) / 2);
  const Y = Buffer.alloc(W * H, 40); // dark background around the card
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const mx = Math.floor(x / scale) - quiet;
      const my = Math.floor(y / scale) - quiet;
      const dark = mx >= 0 && my >= 0 && mx < n && my < n && qr.modules.get(my, mx);
      Y[(y0 + y) * W + (x0 + x)] = dark ? 16 : 235;
    }
  }
  const UV = Buffer.alloc((W / 2) * (H / 2), 128);
  const frame = Buffer.concat([Buffer.from("FRAME\n"), Y, UV, UV]);
  const header = Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`);
  writeFileSync(file, Buffer.concat([header, ...Array.from({ length: 10 }, () => frame)]));
}
