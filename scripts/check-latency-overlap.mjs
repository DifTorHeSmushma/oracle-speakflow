#!/usr/bin/env node
/**
 * G-L1 — structural + unit gate for LATENCY_CONTRACT (issue #13).
 * Fails if speech_end always tears down speculative without a reuse path,
 * or if silence-hint kick is a no-op, or reuse unit tests fail.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const mainPath = resolve(root, "src/electron-main.ts");
const src = readFileSync(mainPath, "utf8");

const checks = [
  {
    id: "reuse-helper",
    ok: src.includes("shouldReuseSpeculative"),
    detail: "electron-main must call shouldReuseSpeculative at speech_end",
  },
  {
    id: "silence-hint-kick",
    ok: /onSilenceHint\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?kickSpeculativeFinalize\s*\(/.test(src),
    detail: "silence-hint must kick speculative (not empty handler)",
  },
  {
    id: "early-mid-speech",
    ok: src.includes("maybeKickEarlySpeculative"),
    detail: "mid-speech speculative overlap must be wired",
  },
  {
    id: "no-unconditional-reset-comment",
    ok: !/Reliability \(#13\): always finalize the FINAL session WAV/.test(src),
    detail: "remove the always-reset-at-speech_end pattern",
  },
];

let failed = false;
for (const c of checks) {
  if (!c.ok) {
    console.error(`G-L1 FAIL — ${c.id}: ${c.detail}`);
    failed = true;
  } else {
    console.log(`G-L1 PASS — ${c.id}`);
  }
}

const unit = spawnSync(
  "npx",
  ["vitest", "run", "--config", "vitest.config.ts", "src/services/__tests__/speculativeReuse.test.ts"],
  { cwd: root, stdio: "inherit", shell: process.platform === "win32" }
);
if (unit.status !== 0) {
  console.error("G-L1 FAIL — speculativeReuse unit tests");
  failed = true;
} else {
  console.log("G-L1 PASS — speculativeReuse unit tests");
}

if (failed) process.exit(1);
console.log("G-L1 PASS — latency overlap contract");
