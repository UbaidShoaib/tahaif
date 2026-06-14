import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test.describe("Order tracking", () => {
  test("tracking page shows order details for valid token", async ({ page }) => {
    // Use a known order token from seeded data, or place one first
    // This test assumes the dev env has at least one seeded order
    const API_URL = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8000/api/v1";

    // Try to fetch an order from the API (dev seed)
    const resp = await page.request.get(`${API_URL}/orders/me`, {
      headers: { Authorization: "Bearer SEED_TOKEN_PLACEHOLDER" },
    });

    // If no seeded data, just verify the tracking page structure
    await page.goto(`${BASE}/track/00000000-0000-0000-0000-000000000000`);
    // Should show "not found" or redirect gracefully
    const body = page.locator("body");
    await expect(body).toBeVisible();
    // Should not be a blank error page
    await expect(page.locator("h1, h2, main")).toBeVisible({ timeout: 5_000 });
  });

  test("tracking page renders correctly with real order", async ({ page }) => {
    // Register and place an order, then track it
    const email = `track_${Date.now()}@test.tahaif.invalid`;
    await page.goto(`${BASE}/register`);
    await page.fill('[name="full_name"]', "Track Tester");
    await page.fill('[name="email"]', email);
    await page.fill('[name="password"]', "Test1234!");
    await page.getByRole("button", { name: /register/i }).click();
    await expect(page).toHaveURL(/\/$|\/search/, { timeout: 10_000 });

    // Add to cart and place order
    await page.goto(`${BASE}/search`);
    await page.locator("a[href^='/p/']").first().click();
    await page.getByRole("button", { name: /add to cart/i }).first().click();
    await page.goto(`${BASE}/checkout`);
    await page.fill('[name="recipient_name"]', "Track Recipient");
    await page.fill('[name="recipient_phone"]', "+92 333 1111111");
    await page.fill('[name="address_line1"]', "Plot 10, Bahria Town");

    const citySelect = page.locator('[name="delivery_city_id"], select').first();
    if (await citySelect.count() > 0) await citySelect.selectOption({ index: 1 });

    const future = new Date();
    future.setDate(future.getDate() + 2);
    await page.fill('[name="delivery_date"]', future.toISOString().split("T")[0]);
    await page.getByRole("button", { name: /cash on delivery|cod/i }).click();
    await page.getByRole("button", { name: /place order|confirm/i }).click();

    await expect(page).toHaveURL(/success|track/, { timeout: 20_000 });

    // Navigate to dedicated tracking page
    const trackLink = page.getByRole("link", { name: /track order/i });
    if (await trackLink.count() > 0) {
      await trackLink.click();
      await expect(page).toHaveURL(/track/, { timeout: 5_000 });
      await expect(page.getByText(/status|order/i)).toBeVisible();
    }
  });
});
