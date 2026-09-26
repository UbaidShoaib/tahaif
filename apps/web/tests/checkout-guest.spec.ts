import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

// ADR 0004: a buyer can go from product page to placed order without an account.
test.describe("Guest checkout flow", () => {
  test("add to cart as a guest → checkout with contact details → order confirmed", async ({ page }) => {
    await page.goto(`${BASE}/search`);
    const firstProduct = page.locator("a[href^='/p/']").first();
    await expect(firstProduct).toBeVisible({ timeout: 10_000 });
    await firstProduct.click();

    // No sign-in redirect: the gift goes straight into a guest cart.
    await page.getByRole("button", { name: /add to cart/i }).first().click();
    await expect(page.getByText("Added to your cart", { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(page).not.toHaveURL(/login/);

    await page.goto(`${BASE}/checkout`);
    await expect(page.getByRole("heading", { name: /your details/i })).toBeVisible();

    await page.fill('[name="contact_email"]', `guest_${Date.now()}@example.com`);
    await page.fill('[name="contact_phone"]', "+44 7700 900123");
    await page.fill('[name="recipient_name"]', "Guest Recipient");
    await page.fill('[name="recipient_phone"]', "+92 300 1234567");
    await page.fill('[name="address_line1"]', "House 1, Street 1, Gulberg III");
    await page.locator('select[name="delivery_city_id"]').selectOption({ index: 1 });

    const future = new Date();
    future.setDate(future.getDate() + 2);
    await page.fill('[name="delivery_date"]', future.toISOString().split("T")[0]);

    await page.locator("label", { hasText: /cash on delivery/i }).click();
    await page.getByRole("button", { name: /place order/i }).click();

    await expect(page).toHaveURL(/success/, { timeout: 20_000 });
    await expect(page.getByText(/keep this link to track your gift/i)).toBeVisible({ timeout: 5_000 });
  });
});
