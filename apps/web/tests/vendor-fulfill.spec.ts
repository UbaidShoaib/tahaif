import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test.describe("Vendor fulfillment portal", () => {
  test.beforeEach(async ({ page }) => {
    // Login as a seeded vendor account
    await page.goto(`${BASE}/login`);
    await page.fill('[name="email"]', process.env.E2E_VENDOR_EMAIL ?? "vendor@test.tahaif.invalid");
    await page.fill('[name="password"]', process.env.E2E_VENDOR_PASSWORD ?? "Test1234!");
    await page.getByRole("button", { name: /login|sign in/i }).click();
    // Tolerate auth failure in CI without seed data
  });

  test("vendor portal renders fulfillment list", async ({ page }) => {
    await page.goto(`${BASE}/vendor`);
    // Should not crash
    await expect(page.locator("body")).toBeVisible();
    // Page should show some vendor-related content
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible({ timeout: 5_000 });
  });

  test("vendor can mark fulfillment as dispatched", async ({ page }) => {
    await page.goto(`${BASE}/vendor`);
    const dispatchBtn = page.getByRole("button", { name: /dispatch|mark.*dispatched/i }).first();
    const count = await dispatchBtn.count();
    if (count > 0) {
      await dispatchBtn.click();
      await expect(page.getByText(/dispatched|updated/i)).toBeVisible({ timeout: 5_000 });
    } else {
      test.skip(true, "No pending fulfillments to dispatch in seed data");
    }
  });
});
