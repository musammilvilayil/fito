import { expect, test } from "@playwright/test";
import { navigate, registerGym, signIn, testPhone } from "./helpers";

test("owner registers, completes the profile, invites a trainer who joins", async ({ page, browser }, info) => {
  const gymName = `E2E Gym ${info.project.name} ${Date.now() % 100000}`;
  const owner = await registerGym(page, { gymName, ownerName: "Anil Kumar" });
  await expect(page.getByRole("heading", { name: /Anil/ })).toBeVisible();
  await expect(page.getByText("Get your gym ready")).toBeVisible();

  // Gym profile
  await navigate(page, "Settings");
  await page.getByLabel("Address").fill("MG Road, Ernakulam");
  await page.getByLabel("Phone").first().fill("98470 11111");
  await page.getByLabel("PIN code").fill("68201");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("PIN code must be 6 digits")).toBeVisible();
  await page.getByLabel("PIN code").fill("682016");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Gym profile saved")).toBeVisible();

  // Invite a trainer
  await page.getByRole("tab", { name: "Staff & roles" }).click();
  await page.getByRole("button", { name: "Invite staff" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Full name").fill("Ravi Trainer");
  const trainerPhone = testPhone();
  await dialog.getByLabel("Mobile number").fill(trainerPhone);
  await dialog.getByLabel("Role").selectOption("trainer");
  await dialog.getByLabel("Specialisations").fill("Strength, Weight loss");
  await dialog.getByRole("button", { name: "Create invite" }).click();
  const url = await page.getByTestId("share-url").innerText();
  expect(url).toContain("/invite/");
  await expect(page.getByRole("link", { name: "Send on WhatsApp" })).toHaveAttribute("href", /wa\.me\/91/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("cell", { name: /^Ravi Trainer/ }).first()).toBeVisible();
  await expect(page.getByText("Invited").first()).toBeVisible();

  // Trainer accepts in a separate browser session
  const { viewport, userAgent, isMobile, hasTouch, deviceScaleFactor, baseURL } = info.project.use;
  const trainerContext = await browser.newContext({ viewport, userAgent, isMobile, hasTouch, deviceScaleFactor, baseURL });
  const trainer = await trainerContext.newPage();
  await trainer.goto(new URL(url).pathname);
  await expect(trainer.getByRole("heading", { name: `Join ${gymName}` })).toBeVisible();
  await trainer.getByLabel("Choose a password").fill("trainer-pass");
  await trainer.getByRole("button", { name: "Create account and join" }).click();
  await expect(trainer).toHaveURL(/\/dashboard/);
  // Trainers don't get staff management.
  await trainer.goto("/settings/staff");
  await expect(trainer.getByText("You don't have access to this page")).toBeVisible();
  await trainerContext.close();

  // Owner signs out and back in with phone + password
  await page.goto("/dashboard");
  await page.reload();
  await page.context().clearCookies();
  await signIn(page, owner.phone, "wrong-password");
  await expect(page.getByText("Incorrect email/phone or password.")).toBeVisible();
  await signIn(page, owner.phone, owner.password);
  await expect(page).toHaveURL(/\/dashboard/);
});

test("protected pages redirect to sign in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  const res = await page.request.get("/api/v1/gym");
  expect(res.status()).toBe(401);
});

test("cookie-authenticated API writes need a same-site origin", async ({ page }) => {
  await registerGym(page, { gymName: `CSRF Gym ${Date.now() % 100000}` });
  const res = await page.request.patch("/api/v1/gym/settings", {
    headers: { origin: "https://evil.example" },
    data: { expiringSoonDays: 5, sessionMinutes: 60, availableEquipment: [] },
  });
  expect(res.status()).toBe(403);
});
