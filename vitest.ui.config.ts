import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import sveltePreprocess from "svelte-preprocess";
import { resolve } from "path";

export default defineConfig({
  plugins: [svelte({ hot: !process.env["VITEST"], preprocess: sveltePreprocess() })],
  resolve: {
    alias: {
      "$lib": resolve(__dirname, "src-ui/lib"),
    },
  },
  test: {
    include: ["src-ui/__tests__/**/*.test.ts"],
    exclude: ["src-ui/__tests__/setup.ts"],
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src-ui/__tests__/setup.ts"],
  },
});
