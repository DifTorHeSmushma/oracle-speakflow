import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Exclude Playwright-based integration tests — those run via `npm run test:integration`
    exclude: ["src-ui/**", "tests/integration/**"],
  },
});
