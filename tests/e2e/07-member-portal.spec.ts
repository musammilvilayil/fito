import { expect, test, type APIRequestContext } from "@playwright/test";
import { expectNoSideScroll, registerGym, testPhone } from "./helpers";

async function call(request: APIRequestContext, baseURL: string, url: string, data: unknown, method: "post" | "put" = "post") {
  const res = await request[method](url, { data, headers: { origin: baseURL } });
  expect(res.ok(), `${url}: ${await res.text()}`).toBeTruthy();
  return (await res.json()).data;
}

test("a member joins, sees their membership and QR, logs a workout and tracks progress", async ({ page, browser, baseURL }, info) => {
  test.setTimeout(90_000);
  await registerGym(page, { gymName: `Member Gym ${info.project.name} ${Date.now() % 100000}` });
  const req = page.request;
  const plan = await call(req, baseURL!, "/api/v1/plans", { name: "Monthly", durationUnit: "months", durationValue: 1, price: "1500", admissionFee: "0" });
  const member = await call(req, baseURL!, "/api/v1/members", { fullName: "Meera Pillai", phone: testPhone(), notes: "Prefers mornings; owes ₹500 from last year" });
  await call(req, baseURL!, "/api/v1/memberships", { memberId: member.id, planId: plan.id, payment: { amount: "1000", method: "upi" } });
  await call(req, baseURL!, `/api/v1/members/${member.id}/fitness`, { fitnessGoal: "general_fitness", experienceLevel: "beginner", trainingDaysPerWeek: 3, sessionMinutes: 45, limitationTags: [] }, "put");
  const invite = await call(req, baseURL!, `/api/v1/members/${member.id}/invite`, {});

  // The member accepts the invite in their own browser session.
  const { viewport, userAgent, isMobile, hasTouch, deviceScaleFactor } = info.project.use;
  const memberCtx = await browser.newContext({ viewport, userAgent, isMobile, hasTouch, deviceScaleFactor, baseURL });
  const m = await memberCtx.newPage();
  await m.goto(new URL(invite.inviteUrl).pathname);
  await m.getByLabel("Choose a password").fill("member-pass");
  await m.getByRole("button", { name: /Create account/ }).click();
  await expect(m).toHaveURL(/\/me$/);
  await expect(m.getByRole("heading", { name: "Hi, Meera" })).toBeVisible();
  await expect(m.getByText("No workout plan yet")).toBeVisible();

  // Trainer (owner here) creates and approves a plan → member is notified.
  const generated = await call(req, baseURL!, "/api/v1/workouts/generate", { memberId: member.id, mode: "template" });
  await call(req, baseURL!, `/api/v1/workouts/${generated.planId}/approve`, { acknowledgeWarnings: true });

  await m.reload();
  await expect(m.getByText("Monthly").first()).toBeVisible();
  await expect(m.getByText("₹500")).toBeVisible(); // due
  await expect(m.getByText("Prefers mornings")).toHaveCount(0); // staff notes never reach the member
  const qr = m.getByRole("img", { name: "Check-in QR code for Meera Pillai" }).first();
  await expect(qr).toBeVisible();
  expect(await qr.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(m.getByRole("link", { name: /Updates \(1 unread\)/ })).toBeVisible();
  await expectNoSideScroll(m);

  // Opening the update marks it read and goes to the workout.
  await m.getByRole("button", { name: /Your new workout plan is ready/ }).click();
  await expect(m).toHaveURL(/\/me\/workouts/);
  await expect(m.getByRole("link", { name: "Updates", exact: true })).toBeVisible();

  // Log the workout: first exercise done with a weight, effort, save.
  const firstDone = m.getByRole("button", { name: /^Mark .* as done$/ }).first();
  await firstDone.click();
  await expect(firstDone).toHaveAttribute("aria-pressed", "true");
  await m.getByRole("textbox", { name: /Weight used for/ }).first().fill("12.5");
  await m.getByRole("radio", { name: "Just right" }).click();
  await m.getByRole("button", { name: "Save progress" }).click();
  await expect(m.getByText("Workout saved")).toBeVisible();
  await expect(m.getByText(/^1\/\d+ done$/)).toBeVisible();
  await expect(m.getByRole("button", { name: "Update today's log" })).toBeVisible();
  await expectNoSideScroll(m);

  // Progress: two weigh-ins make a trend line.
  await m.goto("/me/progress");
  await expect(m.getByText("No measurements yet")).toBeVisible();
  for (const [weight, daysAgo] of [["74", 14], ["72.5", 0]] as const) {
    await m.getByRole("button", { name: "Add measurement" }).click();
    const dlg = m.getByRole("dialog");
    const date = new Date(Date.now() + 5.5 * 3600_000 - daysAgo * 86_400_000).toISOString().slice(0, 10);
    await dlg.getByLabel("Date").fill(date);
    await dlg.getByLabel("Weight (kg)").fill(weight);
    await dlg.getByRole("button", { name: "Save" }).click();
    await expect(m.getByText("Measurement saved").first()).toBeVisible();
    await expect(dlg).toBeHidden();
  }
  await expect(m.getByRole("img", { name: "Weight over time" })).toBeVisible();
  await expect(m.getByText(/−1\.5 kg since/)).toBeVisible();
  await expectNoSideScroll(m);

  // Validation: nothing measured.
  await m.getByRole("button", { name: "Add measurement" }).click();
  await m.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(m.getByText("Enter at least one measurement")).toBeVisible();
  await m.keyboard.press("Escape");

  // Profile: receipts download as PDF; no staff notes.
  await m.goto("/me/profile");
  const receipt = m.getByRole("link", { name: /Download receipt/ }).first();
  await expect(receipt).toBeVisible();
  const pdf = await m.request.get((await receipt.getAttribute("href"))!);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  await expect(m.getByText("Prefers mornings")).toHaveCount(0);
  await expectNoSideScroll(m);

  // Members can't open staff pages; they're sent to their portal.
  await m.goto("/dashboard");
  await expect(m).toHaveURL(/\/me$/);
  await m.goto("/members");
  await expect(m).toHaveURL(/\/me$/);

  // Staff see the member's activity.
  await page.goto(`/members/${member.id}`);
  await expect(page.getByText("Training activity")).toBeVisible();
  await expect(page.getByText("1 workout logged in the last 7 days")).toBeVisible();
  await expect(page.getByText(/72\.5 kg/)).toBeVisible();
  await memberCtx.close();
});
