import { expect, type Page } from "@playwright/test";

export const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

/** Sign up. New accounts go to /verify-email first; "Do this later" continues unverified. */
export async function register(page: Page, prefix: string, password = "Test1234!"): Promise<string> {
  const email = `${prefix}_${Date.now()}@example.com`;
  await page.goto(`${BASE}/register`);
  await page.fill('[name="full_name"]', `${prefix} tester`);
  await page.fill('[name="email"]', email);
  await page.fill('[name="password"]', password);
  await page.getByRole("button", { name: /create account|register/i }).click();
  await expect(page).toHaveURL(/verify-email/, { timeout: 10_000 });
  return email;
}

/** Add the first product in search to the cart and open checkout. */
export async function addFirstProductAndCheckout(page: Page): Promise<void> {
  await page.goto(`${BASE}/search`);
  const firstProduct = page.locator("a[href^='/p/']").first();
  await expect(firstProduct).toBeVisible({ timeout: 10_000 });
  await firstProduct.click();
  await page.getByRole("button", { name: /add to cart/i }).first().click();
  // Wait for the add to finish before leaving the page, or checkout can load an empty cart.
  await expect(page.getByText("Added to your cart", { exact: true })).toBeVisible({ timeout: 5_000 });
  await page.goto(`${BASE}/checkout`);
  await expect(page.getByRole("heading", { name: /recipient & delivery/i })).toBeVisible();
}

/** Choose the first city the cart can be delivered to: checkout refuses cities a gift isn't sold in. */
export async function pickDeliverableCity(page: Page): Promise<void> {
  const select = page.locator('select[name="delivery_city_id"]');
  await expect(select.locator("option").nth(1)).toBeAttached({ timeout: 10_000 });
  const values = await select.locator("option:not([disabled])").evaluateAll((os) =>
    os.map((o) => (o as HTMLOptionElement).value).filter(Boolean),
  );
  for (const value of values) {
    const quoted = page.waitForResponse((r) => r.url().includes("/checkout/quote"), { timeout: 10_000 });
    await select.selectOption(value);
    if ((await quoted).ok()) return;
  }
  throw new Error("No city can take this cart");
}

/** Fill the guest contact, recipient and date fields (2 days out). */
export async function fillGuestDelivery(page: Page, recipient: string): Promise<void> {
  await page.fill('[name="contact_email"]', `guest_${Date.now()}@example.com`);
  await page.fill('[name="contact_phone"]', "+44 7700 900123");
  await page.fill('[name="recipient_name"]', recipient);
  await page.fill('[name="recipient_phone"]', "+92 300 1234567");
  await page.fill('[name="address_line1"]', "House 1, Street 1, Gulberg III");
  await pickDeliverableCity(page);
  const future = new Date();
  future.setDate(future.getDate() + 2);
  await page.fill('[name="delivery_date"]', future.toISOString().split("T")[0]);
}
