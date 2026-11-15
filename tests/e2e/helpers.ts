import { expect, type Page } from "@playwright/test";
import { Client } from "pg";

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
