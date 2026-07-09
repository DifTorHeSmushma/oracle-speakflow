#!/usr/bin/env node
// G19/G30 grep-gate (Spec §4.3 / M6_PUBLIC_LAUNCH_SPEC §8 / M7b §0 Q5)
// Fails if focus-steal APIs appear in paste-path source files.
// Hard floor — Invariant #18 / LD3 / L7.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Match actual function-call syntax (name followed by opening paren), not comments.
// Comment lines (// ... or * ...) mentioning these APIs to say "we don't use them" are fine.
const FORBIDDEN_RE = [
  /SetForegroundWindow\s*\(/,   // win32 activation — existing (G19)
  /AttachThreadInput\s*\(/,     // win32 thread attachment — existing (G19)
  /\bxdotool\b/i,               // G30: no xdotool in the paste path (LD6: xprop only)
  /\bwmctrl\b/i,                // G30: covers wmctrl -a and every other form
  /XSetInputFocus\s*\(/,        // G30: raw Xlib activation
  /windowactivate/i,            // G30: belt for string-built xdotool invocations
];

const CHECKED_FILES = [
  "src/electron-main.ts",
  "src/services/paste.ts",
  "src/services/yieldFocus.ts",
  "src/utils/linux-window.ts",   // G30: Linux paste-path files
  "src/utils/linux-session.ts",  // G30
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
  console.log("check:focus PASS — no focus-steal APIs in paste-focus files (G19/G30)");
}
