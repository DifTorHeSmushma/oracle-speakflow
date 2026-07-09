#!/usr/bin/env node
// G19 grep-gate (Spec §4.3 / M6_PUBLIC_LAUNCH_SPEC §8)
// Fails if SetForegroundWindow or AttachThreadInput appear in the paste-focus
// source files. These calls are forbidden — Invariant #18 / L7 hard floor.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Match actual function-call syntax (name followed by opening paren), not comments.
// Comment lines (// ... or * ...) mentioning these APIs to say "we don't use them" are fine.
const FORBIDDEN_RE = [/SetForegroundWindow\s*\(/, /AttachThreadInput\s*\(/];

const CHECKED_FILES = [
  "src/electron-main.ts",
  "src/services/paste.ts",
  "src/services/yieldFocus.ts",
];

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

let failed = false;

for (const rel of CHECKED_FILES) {
  const abs = resolve(root, rel);
  let src;
  try {
    src = readFileSync(abs, "utf8");
  } catch (err) {
    console.error(`check:focus — cannot read ${rel}: ${err.message}`);
    failed = true;
    continue;
  }
  // Check non-comment lines only (lines not starting with optional-whitespace + // or *)
  const nonCommentLines = src.split("\n").filter((line) => !/^\s*(\/\/|\*)/.test(line));
  const nonCommentSrc = nonCommentLines.join("\n");
  for (const re of FORBIDDEN_RE) {
    if (re.test(nonCommentSrc)) {
      console.error(`check:focus FAIL — '${re.source}' matched in non-comment code in ${rel}`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
} else {
  console.log("check:focus PASS — no SetForegroundWindow / AttachThreadInput in paste-focus files");
}
