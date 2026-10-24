import { test, expect } from "@playwright/test";
import { BASE, register } from "./helpers";

test.describe("Auth flow", () => {
  const password = "Test1234!";

  test("register → verify later → logout → login cycle", async ({ page }) => {
    const email = await register(page, "e2e", password);
    await page.getByRole("link", { name: /do this later/i }).click();
    await expect(page).not.toHaveURL(/verify-email|register/, { timeout: 10_000 });

    // Logout
    await page.getByRole("button", { name: /log ?out|sign out/i }).click();
    await expect(page).toHaveURL(/login|\//, { timeout: 5_000 });

    // Login
    await page.goto(`${BASE}/login`);
    await page.fill('[name="email"]', email);
    await page.fill('[name="password"]', password);
    await page.getByRole("button", { name: /login|sign in/i }).click();
    await expect(page).not.toHaveURL(/login/, { timeout: 10_000 });
  });

  test("wrong password shows error", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('[name="email"]', "nobody@example.com");
    await page.fill('[name="password"]', "wrongpassword");
    await page.getByRole("button", { name: /login|sign in/i }).click();
    await expect(page.getByText(/invalid|incorrect|unauthorized/i)).toBeVisible({ timeout: 5_000 });
  });
});
