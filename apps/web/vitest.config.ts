import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    globals: true,
    // apps/web/tests holds Playwright E2E specs (run via `pnpm exec playwright test`),
    // not vitest unit tests — exclude them so the two runners don't collide.
    exclude: ["node_modules", ".next", "tests/**"],
    passWithNoTests: true,
  },
});
