import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/integration",
  timeout: 30_000,
  use: {
    headless: false, // Electron requires non-headless
  },
  // Integration tests run sequentially (Electron is single-instance)
  workers: 1,
});
