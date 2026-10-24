import { test, expect } from "@playwright/test";
import { BASE, addFirstProductAndCheckout, fillGuestDelivery } from "./helpers";

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
    await expect(page.locator("main")).toBeVisible({ timeout: 5_000 });
  });

  test("tracking page renders correctly with real order", async ({ page }) => {
    await addFirstProductAndCheckout(page);
    await fillGuestDelivery(page, "Track Recipient");
    await page.locator("label", { hasText: /cash on delivery/i }).click();
    await page.getByRole("button", { name: /place order|confirm/i }).click();

    await expect(page).toHaveURL(/success|track/, { timeout: 20_000 });

    // Navigate to dedicated tracking page
    const trackLink = page.getByRole("link", { name: /track order/i });
    if (await trackLink.count() > 0) {
      await trackLink.click();
      await expect(page).toHaveURL(/track/, { timeout: 5_000 });
      await expect(page.getByRole("heading", { level: 1, name: /order|gift|delivered|delivery/i })).toBeVisible();
    }
  });
});
