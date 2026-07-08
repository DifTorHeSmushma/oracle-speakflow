import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import sveltePreprocess from "svelte-preprocess";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
import { fileURLToPath } from "url";

export default defineConfig({
  plugins: [tailwindcss(), svelte({ preprocess: sveltePreprocess() })],
  root: "src-ui",
  // base: "./" makes asset paths relative so the app works with file:// in Electron
  base: "./",
  build: {
    outDir: resolve(__dirname, "dist-ui"),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      // $lib maps to src-ui/lib — used by shadcn-svelte components
      "$lib": resolve(__dirname, "src-ui/lib"),
    },
  },
  // Point Vite's TS transformer to the Svelte-specific tsconfig (verbatimModuleSyntax: true)
  // This prevents TypeScript from eliding Svelte component imports that are only
  // referenced in the HTML template and thus appear "unused" to the TS compiler.
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        verbatimModuleSyntax: true,
      },
    },
  },
});
