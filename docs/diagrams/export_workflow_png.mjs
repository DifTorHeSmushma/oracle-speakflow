/**
 * Export Oracle_SpeakFlow_Workflow_Indigo.excalidraw → PNG via Excalidraw SVG renderer.
 * Usage: node docs/diagrams/export_workflow_png.mjs
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIAGRAM_JSON = join(ROOT, "docs/diagrams/Oracle_SpeakFlow_Workflow_Indigo.excalidraw");
const RENDER_HTML = join(ROOT, "docs/diagrams/render_workflow_local.html");
const OUT_PNG = join(ROOT, "docs/diagrams/Oracle_SpeakFlow_Workflow_Indigo.png");

const json = readFileSync(DIAGRAM_JSON, "utf8");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1200 } });
await page.goto(`file:///${RENDER_HTML.replace(/\\/g, "/")}`);
await page.waitForFunction(() => window.__moduleReady === true);

await page.evaluate(async (data) => {
  await window.renderDiagram(data);
}, json);

await page.waitForFunction(() => window.__renderComplete === true);

const svg = await page.locator("#root svg").first();
const box = await svg.boundingBox();
if (!box) throw new Error("SVG bounding box not found");

await page.screenshot({
  path: OUT_PNG,
  clip: {
    x: box.x,
    y: box.y,
    width: Math.ceil(box.width),
    height: Math.ceil(box.height),
  },
});

await browser.close();
console.log(`Exported ${OUT_PNG}`);
