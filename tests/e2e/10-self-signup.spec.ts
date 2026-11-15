import { expect, test } from "@playwright/test";
import { expectNoSideScroll, registerGym, testPhone } from "./helpers";

test("a member signs up, finds and joins gyms, and switches between them", async ({ page, browser, baseURL }, info) => {
  test.setTimeout(90_000);
  const stamp = `${info.project.name} ${Date.now() % 100000}`;
  const gymA = `Riverside Fitness ${stamp}`;
  const gymB = `Hilltop Gym ${stamp}`;
  await registerGym(page, { gymName: gymA });
  const ownerB = await browser.newPage();
  await registerGym(ownerB, { gymName: gymB });

  // Sign up from the login page.
  const { viewport, userAgent, isMobile, hasTouch, deviceScaleFactor } = info.project.use;
  const ctx = await browser.newContext({ viewport, userAgent, isMobile, hasTouch, deviceScaleFactor, baseURL });
  const m = await ctx.newPage();
  await m.goto("/login");
  await m.getByRole("link", { name: "Create a member account" }).click();
  await m.getByLabel("Your name").fill("Gopika Suresh");
  await m.getByLabel("Mobile number").fill(testPhone());
  await m.getByLabel("Password").fill("member-pass-1");
  await m.getByRole("button", { name: "Create account" }).click();

  // Find the gym and join it.
  await expect(m).toHaveURL(/\/join$/);
  await expect(m.getByRole("heading", { name: "Find your gym" })).toBeVisible();
  await m.getByLabel("Search gyms").fill(gymA);
  await m.getByRole("button", { name: `Join ${gymA}` }).click();
  await expect(m).toHaveURL(/\/me$/);
  await expect(m.getByRole("heading", { name: /Hi, Gopika/ })).toBeVisible();
  await expect(m.getByText("No active membership")).toBeVisible();
  await expectNoSideScroll(m);

  // The gym sees them, without a membership yet.
  await page.goto("/members");
  await expect(page.getByText("Gopika Suresh").filter({ visible: true }).first()).toBeVisible();

  // Join a second gym from the account menu, then switch back.
  await m.getByRole("button", { name: "Account menu" }).click();
  await m.getByRole("menuitem", { name: "Join another gym" }).click();
  await expect(m).toHaveURL(/\/join$/);
  await m.getByLabel("Search gyms").fill(gymB);
  await m.getByRole("button", { name: `Join ${gymB}` }).click();
  await expect(m).toHaveURL(/\/me$/);
  await expect(m.getByText(gymB).first()).toBeVisible();

  await m.getByRole("button", { name: "Account menu" }).click();
  await m.getByRole("menuitem", { name: new RegExp(gymA) }).click();
  await expect(m.getByText(gymA).first()).toBeVisible();

  // A gym that turns off app sign-ups disappears from search.
  await ownerB.goto("/settings");
  await ownerB.waitForLoadState("networkidle"); // form is interactive (hydrated)
  const allow = ownerB.getByLabel("Let people find this gym in the FITO app and join it themselves");
  await allow.uncheck();
  await expect(allow).not.toBeChecked();
  await ownerB.getByRole("button", { name: "Save settings" }).click();
  await expect(ownerB.getByText("Settings saved")).toBeVisible();
  const found = await m.request.get(`/api/v1/gyms/search?q=${encodeURIComponent(gymB)}`);
  expect((await found.json()).data.gyms).toEqual([]);
  await ctx.close();
  await ownerB.close();
});
