import { expect, test, type APIRequestContext } from "@playwright/test";
import { expectNoSideScroll, registerGym, testPhone } from "./helpers";

/**
 * Visits every staff page with realistic data (long names, payments, check-ins,
 * a workout plan) and checks nothing scrolls sideways. Runs on desktop and on
 * a Pixel 7, so layout regressions on phones fail the build.
 */
async function post(request: APIRequestContext, baseURL: string, url: string, data: unknown, method: "post" | "put" = "post") {
  const res = await request[method](url, { data, headers: { origin: baseURL } });
  expect(res.ok(), `${url}: ${await res.text()}`).toBeTruthy();
  return (await res.json()).data;
}

test("every page fits the screen", async ({ page, baseURL }, info) => {
  test.setTimeout(120_000);
  for (const path of ["/", "/login", "/register"]) {
    await page.goto(path);
    await expectNoSideScroll(page);
  }

  await registerGym(page, { gymName: `Thiruvananthapuram Strength & Conditioning ${info.project.name} ${Date.now() % 100000}` });
  const req = page.request;
  const plan = await post(req, baseURL!, "/api/v1/plans", {
    name: "Quarterly unlimited access with personal training",
    durationUnit: "months",
    durationValue: 3,
    price: "4500",
    admissionFee: "500",
  });
  const member = await post(req, baseURL!, "/api/v1/members", {
    fullName: "Anantha Padmanabhan Vasudevan Nair",
    phone: testPhone(),
    email: "anantha.padmanabhan.vasudevan@example.com",
  });
  await post(req, baseURL!, "/api/v1/memberships", {
    memberId: member.id,
    planId: plan.id,
    chargeAdmission: true,
    payment: { amount: "2000", method: "upi", reference: "UPI-REF-4471820093" },
  });
  await post(req, baseURL!, "/api/v1/attendance/check-in", { memberId: member.id });
  await post(
    req,
    baseURL!,
    `/api/v1/members/${member.id}/fitness`,
    { fitnessGoal: "muscle_gain", experienceLevel: "beginner", trainingDaysPerWeek: 4, sessionMinutes: 60, limitationTags: ["knee"] },
    "put",
  );
  await post(req, baseURL!, "/api/v1/staff", {
    fullName: "Sreekumar Balakrishnan Menon",
    phone: testPhone(),
    role: "trainer",
    specializations: ["Strength and conditioning", "Weight loss"],
  });
  const generated = await post(req, baseURL!, "/api/v1/workouts/generate", { memberId: member.id, mode: "template" });

  const pages: [string, RegExp | string][] = [
    ["/dashboard", "Renewals to chase"],
    ["/members", "Anantha Padmanabhan Vasudevan Nair"],
    [`/members/${member.id}`, "Anantha Padmanabhan Vasudevan Nair"],
    [`/members/${member.id}/edit`, "Full name"],
    ["/members/new", "Full name"],
    ["/members/import", "Import members"],
    ["/plans", "Quarterly unlimited access with personal training"],
    ["/payments", "₹2,000"],
    ["/attendance", "Anantha Padmanabhan Vasudevan Nair"],
    ["/attendance/scan", "Start camera"],
    ["/reports", "Members today"],
    ["/workouts", "Anantha Padmanabhan Vasudevan Nair"],
    ["/workouts/new", "Draft with AI"],
    [`/workouts/${generated.planId}`, "Version 1"],
    ["/exercises", "Exercise library"],
    ["/settings", "Gym profile"],
    ["/settings/staff", "Sreekumar Balakrishnan Menon"],
    ["/account", "Your account"],
  ];
  for (const [path, marker] of pages) {
    await page.goto(path);
    await expect(page.getByText(marker).filter({ visible: true }).first(), path).toBeVisible();
    await expectNoSideScroll(page);
  }
});
