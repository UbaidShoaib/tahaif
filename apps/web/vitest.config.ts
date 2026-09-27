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
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts", "./test/setup-intl.ts"],
    // apps/web/tests holds Playwright E2E specs (run via `pnpm exec playwright test`),
    // not vitest unit tests — exclude them so the two runners don't collide.
    exclude: ["node_modules", ".next", "tests/**"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["components/**/*.tsx"],
      thresholds: {
        lines: 60,
        statements: 60,
        functions: 60,
        branches: 55,
      },
    },
  },
});
