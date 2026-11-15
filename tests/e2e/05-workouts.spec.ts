import { expect, test, type APIRequestContext } from "@playwright/test";
import { expectNoSideScroll, navigate, registerGym, testPhone } from "./helpers";

async function post(request: APIRequestContext, baseURL: string, url: string, data: unknown) {
  const res = await request.post(url, { data, headers: { origin: baseURL } });
  expect(res.ok(), `${url}: ${await res.text()}`).toBeTruthy();
  return (await res.json()).data;
}

test("trainer builds, safety-checks and approves a workout plan", async ({ page, browser, baseURL }, info) => {
  await registerGym(page, { gymName: `Coach Gym ${info.project.name} ${Date.now() % 100000}` });
  const req = page.request;
  const member = await post(req, baseURL!, "/api/v1/members", { fullName: "Meera Pillai", phone: testPhone() });
  const invite = await post(req, baseURL!, "/api/v1/staff", { fullName: "Tom Trainer", phone: testPhone(), role: "trainer", specializations: ["Strength"] });

  // Trainer joins (separate session) and the owner assigns the member
  const { viewport, userAgent, isMobile, hasTouch, deviceScaleFactor } = info.project.use;
  const trainerCtx = await browser.newContext({ viewport, userAgent, isMobile, hasTouch, deviceScaleFactor, baseURL });
  const t = await trainerCtx.newPage();
  await t.goto(new URL(invite.inviteUrl).pathname);
  await t.getByLabel("Choose a password").fill("trainer-pass");
  await t.getByRole("button", { name: "Create account and join" }).click();
  await expect(t).toHaveURL(/\/dashboard/);
  const staff = await (await req.get("/api/v1/staff")).json();
  const trainerId = staff.data.find((s: { fullName: string }) => s.fullName === "Tom Trainer").id;
  await post(req, baseURL!, `/api/v1/members/${member.id}/trainer`, { trainerId });

  // Trainer sees only their member
  await navigate(t, "Members");
  await expect(t.getByRole("heading", { name: "My members" })).toBeVisible();
  await t.getByText("Meera Pillai").filter({ visible: true }).first().click();

  // Fitness profile with a knee limitation
  await t.getByRole("button", { name: "Complete" }).click();
  const dlg = t.getByRole("dialog");
  await dlg.getByLabel("Main goal").selectOption("muscle_gain");
  await dlg.getByLabel("Experience").selectOption("beginner");
  await dlg.getByLabel("Training days per week").fill("3");
  await dlg.getByLabel("Minutes per session").fill("60");
  await dlg.getByLabel("Knee pain / injury").check();
  await dlg.getByRole("button", { name: "Save profile" }).click();
  await expect(t.getByText("Fitness profile saved")).toBeVisible();

  // Health screening with a "yes" requires clearance
  await t.getByRole("button", { name: /Health screening/ }).click();
  await t.getByRole("radiogroup", { name: /bone or joint problem/ }).getByRole("radio", { name: "Yes" }).click();
  await t.getByRole("button", { name: "Save answers" }).click();
  await expect(t.getByText("Clearance needed before training plans")).toBeVisible();
  await t.getByRole("button", { name: "Record clearance" }).click();
  await t.getByLabel("Clearance note").fill("Physio letter seen; avoid jumping");
  await t.getByRole("dialog").getByRole("button", { name: "Record clearance" }).click();
  await expect(t.getByText("Cleared: Physio letter seen; avoid jumping")).toBeVisible();

  // Generate (no API key in this environment → template fallback with a notice)
  await t.getByRole("link", { name: "New plan" }).click();
  await expect(t.getByRole("radio", { name: /Draft with AI/ })).toHaveAttribute("aria-checked", "true");
  await t.getByRole("button", { name: "Create draft for review" }).click();
  await expect(t).toHaveURL(/\/workouts\/[0-9a-f-]{36}$/);
  await expect(t.getByText("Needs review").first()).toBeVisible();
  await expect(t.getByText("Template", { exact: true })).toBeVisible();
  await expectNoSideScroll(t);

  // Edit: add a deep-knee exercise for a knee-limited member → safety note
  await t.getByRole("button", { name: "Add exercise" }).first().click();
  await t.getByLabel("Search exercises").fill("Barbell Squat");
  await t.getByRole("button", { name: /^Barbell Squat/ }).first().click();
  await expect(t.getByText(/Barbell Squat is deep knee bending/)).toBeVisible();
  await t.getByRole("button", { name: "Save changes" }).click();
  await expect(t.getByText("Saved as a new version")).toBeVisible();
  await expect(t.getByText("Version 2")).toBeVisible();

  // Approve: warnings must be acknowledged
  await t.getByRole("button", { name: "Approve & assign" }).click();
  const approve = t.getByRole("dialog");
  await expect(approve.getByRole("button", { name: "Approve plan" })).toBeDisabled();
  await approve.getByLabel(/I've reviewed these notes/).check();
  await approve.getByRole("button", { name: "Approve plan" }).click();
  await expect(t.getByText("Plan approved. The member can see it now.")).toBeVisible();
  await expect(t.getByText("Active", { exact: true }).first()).toBeVisible();
  await expect(t.getByText(/approved by Tom Trainer/)).toBeVisible();

  // Exercise library: browse and add a gym-specific exercise
  await navigate(t, "Exercise library");
  await t.getByLabel("Search exercises").fill("bench press");
  await expect(t.getByRole("button", { name: /Barbell Bench Press/ }).first()).toBeVisible();
  await expectNoSideScroll(t);
  await t.getByRole("button", { name: "Add gym exercise" }).click();
  const ce = t.getByRole("dialog");
  await ce.getByLabel("Name").fill("Hammer Strength Row");
  await ce.getByLabel("middle back").check();
  await ce.getByLabel("Demo video (YouTube)").fill("https://example.com/video");
  await ce.getByRole("button", { name: "Add exercise" }).click();
  await expect(ce.getByText(/Use a YouTube link/)).toBeVisible();
  await ce.getByLabel("Demo video (YouTube)").fill("https://youtu.be/dQw4w9WgXcQ");
  await ce.getByRole("button", { name: "Add exercise" }).click();
  await expect(t.getByText("Exercise added to your gym's library")).toBeVisible();
  await t.getByLabel("Search exercises").fill("Hammer Strength");
  await expect(t.getByRole("button", { name: /Hammer Strength Row/ })).toBeVisible();
  await trainerCtx.close();
});
