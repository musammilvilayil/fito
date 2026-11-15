import { expect, test } from "@playwright/test";
import { navigate, registerGym, testPhone } from "./helpers";

test("plans, selling a membership, receipts, dues, freeze and the payments report", async ({ page }, info) => {
  await registerGym(page, { gymName: `Billing Gym ${info.project.name} ${Date.now() % 100000}` });

  // Create a plan from a preset
  await navigate(page, "Plans");
  await page.getByRole("button", { name: "Monthly" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Price (₹)").fill("1,500");
  await dialog.getByLabel("Admission fee (₹)").fill("500");
  await dialog.getByRole("button", { name: "Create plan" }).click();
  await expect(page.getByRole("heading", { name: "Monthly" })).toBeVisible();
  await expect(page.getByText("₹1,500").first()).toBeVisible();

  // Add a member
  await page.goto("/members/new");
  await page.getByLabel("Full name").fill("Rahul Krishnan");
  await page.getByLabel("Mobile number").fill(testPhone());
  await page.getByRole("button", { name: "Add member" }).click();
  await expect(page.getByRole("dialog")).toContainText("Invite Rahul Krishnan");
  await page.keyboard.press("Escape"); // close the invite dialog
  await expect(page.getByRole("heading", { name: "Rahul Krishnan" })).toBeVisible();

  // Sell with admission fee, 10% discount and a part payment
  await page.getByRole("button", { name: "Sell membership" }).click();
  const sell = page.getByRole("dialog");
  await expect(sell.getByLabel(/Charge admission fee/)).toBeChecked();
  await sell.getByLabel("Discount", { exact: true }).selectOption("percent");
  await sell.getByLabel("Discount %").fill("10");
  await expect(sell.getByText("₹1,800")).toBeVisible(); // (1500 + 500) - 10%
  await sell.getByLabel("Amount received (₹)").fill("1000");
  await sell.getByLabel("Method").selectOption("upi");
  await sell.getByRole("button", { name: "Save and issue receipt" }).click();
  await expect(page.getByText(/Membership added · receipt/)).toBeVisible();
  await expect(page.getByText("Active", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/₹800/).filter({ visible: true }).first()).toBeVisible(); // amount due

  // Receipt PDF
  const receiptLink = page.getByRole("link", { name: /\/0001/ }).first();
  const href = await receiptLink.getAttribute("href");
  const pdf = await page.request.get(href!);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // Pay the balance
  await page.getByRole("button", { name: "Actions for Monthly membership" }).click();
  await page.getByRole("menuitem", { name: "Record payment" }).click();
  const pay = page.getByRole("dialog");
  await expect(pay.getByLabel("Amount (₹)")).toHaveValue("800");
  await pay.getByRole("button", { name: "Record and issue receipt" }).click();
  await expect(page.getByText("Payment recorded")).toBeVisible();

  // Freeze and unfreeze
  await page.getByRole("button", { name: "Actions for Monthly membership" }).click();
  await page.getByRole("menuitem", { name: "Freeze" }).click();
  await page.getByRole("dialog").getByLabel("Reason").fill("Travelling to Dubai");
  await page.getByRole("dialog").getByRole("button", { name: "Freeze membership" }).click();
  await expect(page.getByText("Frozen", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Actions for Monthly membership" }).click();
  await page.getByRole("menuitem", { name: "Unfreeze" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Unfreeze" }).click();
  await expect(page.getByText("Membership resumed")).toBeVisible();

  // Payments report
  await navigate(page, "Payments");
  await expect(page.getByText("Collected today")).toBeVisible();
  await expect(page.getByText("₹1,800").first()).toBeVisible();
  await expect(page.getByText("Rahul Krishnan").filter({ visible: true }).first()).toBeVisible();
  const csv = await page.request.get(await page.getByRole("link", { name: "Export CSV" }).getAttribute("href").then((h) => h!));
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain("Rahul Krishnan");

  await page.getByRole("link", { name: /^Dues/ }).click();
  await expect(page.getByText("No outstanding dues")).toBeVisible();
});
