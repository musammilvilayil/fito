import { expect, test } from "@playwright/test";
import { navigate, registerGym, testPhone } from "./helpers";

test("front desk flow: add, search, edit and deactivate a member", async ({ page }, info) => {
  await registerGym(page, { gymName: `Members Gym ${info.project.name} ${Date.now() % 100000}` });
  await navigate(page, "Members");
  await expect(page.getByText("No members yet")).toBeVisible();

  await page.getByRole("link", { name: "Add member" }).first().click();
  await page.getByLabel("Full name").fill("Anjali Nair");
  await page.getByLabel("Mobile number").fill("12345");
  await page.getByRole("button", { name: "Add member" }).click();
  await expect(page.getByText("Enter a valid phone number, e.g. 98470 12345")).toBeVisible();
  const phone = testPhone();
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByLabel("Gender").selectOption("female");
  await page.getByRole("button", { name: "Add member" }).click();

  // Invite link dialog for the member app
  await expect(page.getByRole("dialog")).toContainText("Invite Anjali Nair to the FITO app");
  await expect(page.getByRole("link", { name: "Send on WhatsApp" })).toHaveAttribute("href", new RegExp(`wa\\.me/91${phone}`));
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Anjali Nair" })).toBeVisible();
  await expect(page.getByText("No membership", { exact: true }).first()).toBeVisible();

  // Edit
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Notes").fill("Morning batch, knee injury in 2024");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Morning batch, knee injury in 2024")).toBeVisible();

  // Search from the list
  await navigate(page, "Members");
  await page.getByLabel("Search name, phone or member ID").fill(phone.slice(-5));
  await expect(page).toHaveURL(/q=/);
  await expect(page.getByText("Anjali Nair").filter({ visible: true }).first()).toBeVisible();
  await page.getByLabel("Search name, phone or member ID").fill("zzz-nobody");
  await expect(page.getByText("No members match")).toBeVisible();

  // Deactivate
  await page.getByLabel("Search name, phone or member ID").fill("");
  await page.getByText("Anjali Nair").filter({ visible: true }).first().click();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Deactivate member" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Deactivate" }).click();
  await expect(page.getByText("Deactivated", { exact: true }).first()).toBeVisible();
});

test("imports a CSV register with a dry run first", async ({ page }, info) => {
  await registerGym(page, { gymName: `Import Gym ${info.project.name} ${Date.now() % 100000}` });
  await page.goto("/members/import");
  const csv = [
    "Member Name,Mobile,Expiry Date,Start Date,Amount Paid,Plan",
    `Rahul K,${testPhone()},15/02/2099,15/11/2098,3000,Quarterly`,
    `Sneha P,${testPhone()},,,,`,
    `Broken Row,123,,,,`,
  ].join("\n");
  await page.getByLabel("Choose file").setInputFiles({ name: "register.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByText("register.csv · 3 rows")).toBeVisible();
  await page.getByRole("button", { name: "Check file" }).click();
  await expect(page.getByText("Review before importing")).toBeVisible();
  await expect(page.getByText("Enter a valid phone number, e.g. 98470 12345")).toBeVisible();
  await page.getByRole("button", { name: "Import 2 members" }).click();
  await expect(page.getByText("Import complete")).toBeVisible();
  await expect(page.getByText(/Added 2 members and 1 current membership/)).toBeVisible();
  await page.getByRole("link", { name: "View members" }).click();
  await expect(page.getByText("Rahul K").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Sneha P").filter({ visible: true }).first()).toBeVisible();
});
