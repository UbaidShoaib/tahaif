import { test, expect } from "@playwright/test";
import { addFirstProductAndCheckout, fillGuestDelivery, register } from "./helpers";

test.describe("COD checkout flow", () => {
  test("add product → checkout with COD → order confirmed", async ({ page }) => {
    await addFirstProductAndCheckout(page);
    await fillGuestDelivery(page, "Test Recipient");

    // Payment methods are radio cards: click the card, then confirm the radio is selected.
    await page.locator("label", { hasText: /cash on delivery/i }).click();
    await expect(page.getByRole("radio", { name: /cash on delivery|cod/i })).toBeChecked();

    await page.getByRole("button", { name: /place order|confirm/i }).click();
    await expect(page).toHaveURL(/success|track/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1, name: /order (is )?placed|confirmed/i })).toBeVisible({ timeout: 5_000 });
  });

  test("signed-in buyers must verify their email before ordering", async ({ page }) => {
    await register(page, "cod");
    await addFirstProductAndCheckout(page);
    await expect(page.getByText(/verify your email to place this order/i)).toBeVisible();
  });
});
