import { test, expect } from "@playwright/test";

const PASSWORD = "demo1234";

async function signIn(page, email) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
}

test("every main page fits a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, "admin@yac.local");
  for (const path of ["/", "/o/opportunity", "/o/opportunity?mode=kanban", "/o/lead", "/chatter", "/reports", "/dashboards", "/calendar", "/forecasts", "/setup/objects", "/outbox"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const [scroll, width] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(scroll, path).toBeLessThanOrEqual(width + 1);
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
  }
});

test("a Chatter mention reaches the mentioned person's bell", async ({ page }) => {
  await signIn(page, "rep1@yac.local");
  await page.goto("/o/account");
  await page.locator("tbody a").first().click();
  await page.getByRole("tab", { name: "Chatter" }).click();
  const box = page.getByRole("textbox", { name: "Chatter" });
  await box.fill("Can you join the renewal call @Sam");
  await page.getByRole("option", { name: "Sam Singh" }).click();
  await page.getByRole("button", { name: "Share" }).click();
  await expect(page.getByText("@Sam Singh")).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, "rep2@yac.local");
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(page.getByText("Riya Rao mentioned you")).toBeVisible();
});

test("submit a large deal and the manager approves it", async ({ page }) => {
  await signIn(page, "rep1@yac.local");
  await page.goto("/o/opportunity");
  await page.getByRole("button", { name: "New", exact: true }).first().click();
  const form = page.getByRole("dialog", { name: "New Opportunity" });
  await form.getByLabel("Opportunity Name").fill("Mega Deal");
  await form.getByLabel("Close Date").fill("2026-12-15");
  await form.getByLabel("Amount").fill("250000");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mega Deal" })).toBeVisible();
  await page.getByRole("button", { name: "Show more actions" }).click();
  await page.getByRole("menuitem", { name: "Submit for Approval" }).click();
  await page.getByRole("dialog", { name: "Submit for Approval" }).getByRole("button", { name: "Submit for Approval" }).click();
  await expect(page.getByText(/Waiting for approval from Max Mehta/)).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, "manager@yac.local");
  await page.getByRole("link", { name: "Mega Deal" }).first().click();
  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("dialog", { name: "Approve" }).getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Request approved.")).toBeVisible();
  await expect(page.getByText("Approved for proposal").first()).toBeVisible();
});

test("email from a contact goes to the outbox and shows on the timeline", async ({ page }) => {
  await signIn(page, "admin@yac.local");
  await page.goto("/o/contact?q=.example");
  await page.locator("tbody a").first().click();
  await page.getByRole("tab", { name: "Email" }).click();
  await expect(page.getByRole("textbox", { name: "To", exact: true })).not.toHaveValue("");
  await page.getByRole("textbox", { name: "Subject", exact: true }).fill("Quarterly check-in for {!Contact.FirstName}");
  await page.getByRole("textbox", { name: "Body", exact: true }).fill("Hello {!Contact.FirstName}");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Email saved to the outbox.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Email: Quarterly check-in for/ })).toBeVisible();
  await page.goto("/outbox");
  await expect(page.getByText(/Quarterly check-in for/).first()).toBeVisible();
});
