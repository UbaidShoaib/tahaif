import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test.describe("Auth flow", () => {
  const email = `e2e_${Date.now()}@test.tahaif.invalid`;
  const password = "Test1234!";

  test("register → login → logout cycle", async ({ page }) => {
    // Register
    await page.goto(`${BASE}/register`);
    await page.fill('[name="full_name"]', "E2E Tester");
    await page.fill('[name="email"]', email);
    await page.fill('[name="password"]', password);
    await page.getByRole("button", { name: /register/i }).click();
    await expect(page).toHaveURL(/\/$|\/search/, { timeout: 10_000 });

    // Logout
    await page.getByRole("button", { name: /logout|sign out/i }).click();
    await expect(page).toHaveURL(/login|\//, { timeout: 5_000 });

    // Login
    await page.goto(`${BASE}/login`);
    await page.fill('[name="email"]', email);
    await page.fill('[name="password"]', password);
    await page.getByRole("button", { name: /login|sign in/i }).click();
    await expect(page).toHaveURL(/\/$|\/search/, { timeout: 10_000 });
  });

  test("wrong password shows error", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('[name="email"]', "nobody@tahaif.invalid");
    await page.fill('[name="password"]', "wrongpassword");
    await page.getByRole("button", { name: /login|sign in/i }).click();
    await expect(page.getByText(/invalid|incorrect|unauthorized/i)).toBeVisible({ timeout: 5_000 });
  });
});
