import { test, _electron as electron } from "@playwright/test";
import { join } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const APP_ROOT = join(__dirname, "..", "..");
const MAIN_JS = join(APP_ROOT, "dist", "electron-main.js");
const ELECTRON_EXE: string = require("electron") as string;

test("debug: check page content and console", async () => {
  const electronApp = await electron.launch({
    executablePath: ELECTRON_EXE,
    args: [MAIN_JS],
    env: { ...process.env, TEST_MODE: "true", GROQ_API_KEY: "sk-test" },
  });
  const page = await electronApp.firstWindow();

  const consoleMessages: string[] = [];
  page.on("console", msg => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", err => {
    consoleMessages.push(`[pageerror] ${err.message}`);
  });

  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(5000);

  const html = await page.content();
  console.log("HTML (first 800):", html.slice(0, 800));
  console.log("Console messages:", consoleMessages.join("\n"));

  await electronApp.close().catch(() => {});
});
