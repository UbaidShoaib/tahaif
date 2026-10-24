import { test, expect } from "@playwright/test";
import { addFirstProductAndCheckout, fillGuestDelivery } from "./helpers";

// ADR 0004: a buyer can go from product page to placed order without an account.
test.describe("Guest checkout flow", () => {
  test("add to cart as a guest → checkout with contact details → order confirmed", async ({ page }) => {
    await addFirstProductAndCheckout(page);
    await expect(page).not.toHaveURL(/login/);
    await expect(page.getByRole("heading", { name: /your details/i })).toBeVisible();

    await fillGuestDelivery(page, "Guest Recipient");
    await page.locator("label", { hasText: /cash on delivery/i }).click();
    await page.getByRole("button", { name: /place order/i }).click();

    await expect(page).toHaveURL(/success/, { timeout: 20_000 });
    await expect(page.getByText(/keep this link to track your gift/i)).toBeVisible({ timeout: 5_000 });
  });
});
