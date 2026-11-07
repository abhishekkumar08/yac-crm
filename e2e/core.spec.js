import { test, expect } from "@playwright/test";

const PASSWORD = "demo1234";

async function dragTo(page, source, target) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  await page.mouse.move(from.x + 20, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + 60, { steps: 12 });
  await page.mouse.up();
}

async function signIn(page, email) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
}

test("lead to closed-won opportunity, then it shows in a report", async ({ page }) => {
  await signIn(page, "rep1@yac.local");
  await page.goto("/o/lead");
  await page.getByRole("button", { name: "New", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Last Name").fill("Lovelace");
  await dialog.getByLabel("Company").fill("Analytical Engines");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Lovelace" })).toBeVisible();

  await page.getByRole("button", { name: "Convert" }).first().click();
  const convert = page.getByRole("dialog", { name: "Convert Lead" });
  await convert.getByLabel("Opportunity Name").fill("Analytical Engines - Pilot");
  await convert.getByRole("button", { name: "Convert" }).click();
  await expect(convert.getByText("Your lead has been converted.")).toBeVisible();
  await convert.getByRole("link", { name: "Opportunity" }).click();
  await expect(page.getByRole("heading", { name: "Analytical Engines - Pilot" })).toBeVisible();

  await page.goto("/o/opportunity?mode=kanban");
  const card = page.locator("[draggable=true]").filter({ hasText: "Analytical Engines - Pilot" });
  await dragTo(page, card, page.getByRole("region", { name: "Qualification" }));
  await expect(page.getByText("Analytical Engines - Pilot moved to Qualification.")).toBeVisible();

  await card.getByRole("link", { name: "Analytical Engines - Pilot" }).click();
  await page.getByRole("navigation", { name: "Path" }).getByRole("button", { name: "Closed" }).click();
  await page.getByRole("button", { name: "Mark Closed as Current" }).click();
  await page.getByRole("dialog", { name: "Select Closed Stage" }).getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("navigation", { name: "Path" }).getByRole("button", { name: "Closed Won" })).toBeVisible();

  await page.goto("/reports");
  await page.getByRole("link", { name: "Closed Won by Owner" }).click();
  await expect(page.getByRole("cell", { name: "Riya Rao" })).toBeVisible();
});

test("admin adds a custom field and sees it on the form", async ({ page }) => {
  await signIn(page, "admin@yac.local");
  await page.goto("/setup/objects/account");
  await page.getByRole("button", { name: "New Field" }).click();
  const editor = page.getByRole("dialog", { name: "New Field" });
  await editor.getByLabel("Field Label").fill("Customer Tier");
  await editor.getByLabel("Data Type").selectOption("picklist");
  await editor.getByLabel("Values (one per line)").fill("Gold\nSilver\nBronze");
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("cell", { name: "customer_tier__c" })).toBeVisible();

  await page.goto("/o/account");
  await page.getByRole("button", { name: "New", exact: true }).first().click();
  const form = page.getByRole("dialog", { name: "New Account" });
  await form.getByLabel("Account Name").fill("Tiered Co");
  await form.getByLabel("Customer Tier").selectOption("Gold");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tiered Co" })).toBeVisible();
  await expect(page.getByText("Gold")).toBeVisible();
});

test("a rep cannot open Setup", async ({ page }) => {
  await signIn(page, "rep2@yac.local");
  await page.goto("/setup");
  await expect(page.getByText("Only admins can open Setup.")).toBeVisible();
});
