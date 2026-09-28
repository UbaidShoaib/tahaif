import path from "path";
import { defineConfig } from "vitest/config";

// Unit tests live next to the code as *.test.ts(x). tests/ holds Playwright
// end-to-end specs, which run with `npx playwright test`, not vitest.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "tests/**"],
  },
});
