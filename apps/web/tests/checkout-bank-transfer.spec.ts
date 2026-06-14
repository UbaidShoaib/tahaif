import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test.describe("Bank transfer checkout + proof upload", () => {
  test.beforeEach(async ({ page }) => {
    const email = `bt_${Date.now()}@test.tahaif.invalid`;
    await page.goto(`${BASE}/register`);
    await page.fill('[name="full_name"]', "BT Tester");
    await page.fill('[name="email"]', email);
    await page.fill('[name="password"]', "Test1234!");
    await page.getByRole("button", { name: /register/i }).click();
    await expect(page).toHaveURL(/\/$|\/search/, { timeout: 10_000 });
  });

  test("checkout with bank transfer shows IBAN and proof upload section", async ({ page }) => {
    await page.goto(`${BASE}/search`);
    await page.locator("a[href^='/p/']").first().click();
    await page.getByRole("button", { name: /add to cart/i }).first().click();
    await page.goto(`${BASE}/checkout`);

    // Fill form
    await page.fill('[name="recipient_name"]', "Bank Recipient");
    await page.fill('[name="recipient_phone"]', "+92 321 9876543");
    await page.fill('[name="address_line1"]', "Flat 5, DHA Phase 2");

    const citySelect = page.locator('[name="delivery_city_id"], select').first();
    if (await citySelect.count() > 0) await citySelect.selectOption({ index: 1 });

    const future = new Date();
    future.setDate(future.getDate() + 2);
    await page.fill('[name="delivery_date"]', future.toISOString().split("T")[0]);

    // Select bank transfer
    await page.getByRole("button", { name: /bank transfer/i }).click();

    // IBAN section should appear (from env var or fallback)
    await expect(page.getByText(/IBAN|bank/i)).toBeVisible();

    // Place order
    await page.getByRole("button", { name: /place order|confirm/i }).click();
    await expect(page).toHaveURL(/success|track/, { timeout: 20_000 });

    // Proof upload section must appear
    await expect(page.getByText(/upload.*receipt|payment receipt/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: /upload receipt/i })).toBeVisible();
  });
});
