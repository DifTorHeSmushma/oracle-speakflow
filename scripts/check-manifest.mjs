import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MANIFEST = join(ROOT, "resources", "bin", "models.sha256");
const ELECTRON_MAIN = join(ROOT, "src", "electron-main.ts");

function fail(message) {
  process.stderr.write(`[check-manifest] FAIL: ${message}\n`);
  process.exit(1);
}

function ok(message) {
  process.stderr.write(`[check-manifest] OK: ${message}\n`);
}

const manifest = readFileSync(MANIFEST, "utf8");

if (/\bTODO\b/i.test(manifest)) {
  fail("models.sha256 contains TODO");
}

for (const [idx, rawLine] of manifest.split("\n").entries()) {
  const lineNo = idx + 1;
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) continue;

  const parts = line.split(/\s+/);
  const hash = parts[0];
  const filename = parts[1];

  if (!hash || !filename) {
    fail(`models.sha256:${lineNo} is malformed (expected '<64hex>  <filename>')`);
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hash)) {
    fail(`models.sha256:${lineNo} hash is not 64-hex: '${hash}'`);
  }
}
ok("models.sha256 hashes look valid");

const electronMain = readFileSync(ELECTRON_MAIN, "utf8");
if (electronMain.includes("MODEL_SHA256") || /\bSHA256\b/.test(electronMain)) {
  fail("src/electron-main.ts contains inline SHA reference (MODEL_SHA256/SHA256)");
}
ok("electron-main.ts contains no inline SHA references");

process.stderr.write("[check-manifest] PASS\n");
