import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test.describe("COD checkout flow", () => {
  test.beforeEach(async ({ page }) => {
    // Seed: register and log in with a fresh account
    const email = `cod_${Date.now()}@test.tahaif.invalid`;
    await page.goto(`${BASE}/register`);
    await page.fill('[name="full_name"]', "COD Tester");
    await page.fill('[name="email"]', email);
    await page.fill('[name="password"]', "Test1234!");
    await page.getByRole("button", { name: /register/i }).click();
    await expect(page).toHaveURL(/\/$|\/search/, { timeout: 10_000 });
  });

  test("add product → checkout with COD → order confirmed", async ({ page }) => {
    // Browse to a product and add to cart
    await page.goto(`${BASE}/search`);
    const firstProduct = page.locator("a[href^='/p/']").first();
    await expect(firstProduct).toBeVisible({ timeout: 10_000 });
    await firstProduct.click();

    // Add to cart
    await page.getByRole("button", { name: /add to cart/i }).first().click();
    await expect(page.getByText(/cart/i)).toBeVisible({ timeout: 5_000 });

    // Go to checkout
    await page.goto(`${BASE}/checkout`);
    await expect(page).toHaveURL(/checkout/);

    // Fill delivery details
    await page.fill('[name="recipient_name"]', "Test Recipient");
    await page.fill('[name="recipient_phone"]', "+92 300 1234567");
    await page.fill('[name="address_line1"]', "House 1, Street 1, Gulberg III");

    // Select a city
    const citySelect = page.locator('[name="delivery_city_id"], select').first();
    if (await citySelect.count() > 0) {
      await citySelect.selectOption({ index: 1 });
    }

    // Pick a future date (today + 2 days)
    const future = new Date();
    future.setDate(future.getDate() + 2);
    const dateStr = future.toISOString().split("T")[0];
    await page.fill('[name="delivery_date"]', dateStr);

    // COD payment
    await page.getByRole("button", { name: /cash on delivery|cod/i }).click();

    // Place order
    await page.getByRole("button", { name: /place order|confirm/i }).click();

    // Should land on success page
    await expect(page).toHaveURL(/success|track/, { timeout: 20_000 });
    await expect(page.getByText(/order placed|confirmed/i)).toBeVisible({ timeout: 5_000 });
  });
});
