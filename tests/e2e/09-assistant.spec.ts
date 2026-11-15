import { expect, test, type APIRequestContext } from "@playwright/test";
import { expectNoSideScroll, registerGym, testPhone } from "./helpers";

/**
 * The assistant UI end to end, against the scripted test model
 * (ASSISTANT_PROVIDER=fake): streaming replies, tool status, a proposed change
 * that only saves on Confirm, history, and the owner's AI settings.
 */
async function call(request: APIRequestContext, baseURL: string, url: string, data: unknown, method: "post" | "put" | "patch" = "post") {
  const res = await request[method](url, { data, headers: { origin: baseURL } });
  expect(res.ok(), `${url}: ${await res.text()}`).toBeTruthy();
  return (await res.json()).data;
}

test("members and staff use the assistant; owners control it", async ({ page, browser, baseURL }, info) => {
  test.setTimeout(90_000);
  await registerGym(page, { gymName: `Ask Gym ${info.project.name} ${Date.now() % 100000}` });
  const req = page.request;
  const plan = await call(req, baseURL!, "/api/v1/plans", { name: "Monthly", durationUnit: "months", durationValue: 1, price: "1500", admissionFee: "0" });
  const member = await call(req, baseURL!, "/api/v1/members", { fullName: "Nisha Varghese", phone: testPhone() });
  await call(req, baseURL!, "/api/v1/memberships", { memberId: member.id, planId: plan.id, payment: { amount: "1000", method: "upi" } });
  const invite = await call(req, baseURL!, `/api/v1/members/${member.id}/invite`, {});

  // Owner: the assistant uses staff tools.
  await page.goto("/assistant");
  await expect(page.getByRole("heading", { name: "Assistant" })).toBeVisible();
  await page.getByRole("button", { name: "How many people checked in today?" }).click();
  await expect(page.getByText("Checking today at the gym")).toBeVisible();
  await expect(page.getByText(/Here is what I found: .*checkInsToday/)).toBeVisible();
  await expectNoSideScroll(page);

  // Member joins and asks about their membership.
  const { viewport, userAgent, isMobile, hasTouch, deviceScaleFactor } = info.project.use;
  const memberCtx = await browser.newContext({ viewport, userAgent, isMobile, hasTouch, deviceScaleFactor, baseURL });
  const m = await memberCtx.newPage();
  await m.goto(new URL(invite.inviteUrl).pathname);
  await m.getByLabel("Choose a password").fill("member-pass");
  await m.getByRole("button", { name: /Create account/ }).click();
  await expect(m).toHaveURL(/\/me$/);
  await m.getByRole("link", { name: "Ask" }).filter({ visible: true }).first().click();
  await expect(m.getByRole("heading", { name: "Ask FITO" })).toBeVisible();
  await m.getByRole("button", { name: "When does my membership end?" }).click();
  await expect(m.getByText("Checking your membership")).toBeVisible();
  await expect(m.getByText(/Here is what I found: .*₹500/)).toBeVisible(); // ₹1,500 plan, ₹1,000 paid
  await expectNoSideScroll(m);

  // A change is only proposed; it saves when the member confirms.
  const box = m.getByRole("textbox", { name: "Message the assistant" });
  await box.fill("Log my weight 72 kg please");
  await box.press("Enter");
  await expect(m.getByText("Save weight 72 kg (today)", { exact: true })).toBeVisible();
  await m.getByRole("button", { name: "Confirm" }).click();
  await expect(m.getByText("Saved", { exact: true }).first()).toBeVisible();
  await m.goto("/me/progress");
  await expect(m.getByText(/Weight 72 kg/)).toBeVisible();

  // History brings the conversation back.
  await m.goto("/me/assistant");
  await m.getByRole("button", { name: "History" }).click();
  await m.getByRole("menuitem", { name: /When does my membership end/ }).click();
  await expect(m.getByText("Save weight 72 kg (today)", { exact: true })).toBeVisible();
  await expect(m.getByText("Saved", { exact: true }).first()).toBeVisible();

  // Owner: Settings → AI shows usage and can turn the assistant off for members.
  await page.goto("/settings");
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await expect(page.getByText("Assistant replies")).toBeVisible();
  await page.getByLabel("Members (in their app)").uncheck();
  await page.getByRole("button", { name: "Save AI settings" }).click();
  await expect(page.getByText("AI settings saved")).toBeVisible();
  await m.reload();
  await expect(m.getByText("Your gym hasn't turned on the assistant for members.")).toBeVisible();
  const blocked = await m.request.post("/api/v1/assistant/chat", { data: { message: "hi" }, headers: { origin: baseURL! } });
  expect(blocked.status()).toBe(503);
  await memberCtx.close();
});
