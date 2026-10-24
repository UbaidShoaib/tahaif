import { test, expect } from "@playwright/test";
import { addFirstProductAndCheckout, fillGuestDelivery } from "./helpers";

test.describe("Bank transfer checkout + proof upload", () => {
  test("checkout with bank transfer shows IBAN and proof upload section", async ({ page }) => {
    await addFirstProductAndCheckout(page);
    await fillGuestDelivery(page, "Bank Recipient");

    // Payment methods are radio cards: click the card, then confirm the radio is selected.
    await page.locator("label", { hasText: /bank transfer/i }).click();
    await expect(page.getByRole("radio", { name: /bank transfer/i })).toBeChecked();

    // IBAN section should appear (from env var or fallback)
    await expect(page.getByText(/IBAN/i)).toBeVisible();

    await page.getByRole("button", { name: /place order|confirm/i }).click();
    await expect(page).toHaveURL(/success|track/, { timeout: 20_000 });

    // Proof upload section must appear
    await expect(page.getByText(/upload your bank transfer receipt/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: /upload receipt/i })).toBeVisible();
  });
});
