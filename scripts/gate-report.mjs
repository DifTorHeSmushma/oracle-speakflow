#!/usr/bin/env node
// Gate runner for PRD-windows-dictation-delivery-brownfield §8 (issue #9).
// Every gate here is automated: green means merge-ready without any human smoke run (LD5/M6).
import { spawnSync } from "node:child_process";

const GATES = [
  {
    id: "G-D1b",
    covers: "M1/#11 — Electron/Cursor-class host receives text via restore+Ctrl+V",
    command: ["npm", "run", "check:delivery:electron"],
  },
  {
    id: "G-D1",
    covers: "M1 — captured external HWND receives the finalize text (10/10 Notepad)",
    command: ["npm", "run", "check:delivery"],
  },
  {
    id: "G-W1",
    covers: "WER/meaning fixture pack including Dom speakflow pair (#12)",
    command: ["npm", "run", "check:wer"],
  },
  {
    id: "G-L1",
    covers: "LATENCY_CONTRACT — mid-speech/silence-hint overlap + reuse at speech_end (#13)",
    command: ["npm", "run", "check:latency-overlap"],
  },
  {
    id: "G-D2",
    covers: "M2 — no keystroke paste into SpeakFlow's own window",
    command: ["npx", "vitest", "run", "--config", "vitest.config.ts", "src/services/__tests__/delivery.test.ts"],
  },
  {
    id: "G-D3",
    covers: "M3 — 2.0 s mid-pause does not false-finalize at shipped defaults",
    command: ["npx", "vitest", "run", "--config", "vitest.config.ts", "tests/vad.test.ts"],
  },
  {
    id: "G-D4",
    covers: "M4 — cloud STT timeout/error kinds are typed and retried correctly",
    command: ["npx", "vitest", "run", "--config", "vitest.config.ts", "tests/transcription.test.ts"],
  },
  {
    id: "G-D5",
    covers: "M5 — typecheck + full unit suite + focus grep",
    command: null,
    steps: [
      ["npm", "run", "typecheck"],
      ["npm", "test"],
      ["npm", "run", "check:focus"],
    ],
  },
];

const run = (command) => {
  const [bin, ...args] = command;
  const result = spawnSync(bin, args, { stdio: "inherit", shell: process.platform === "win32" });
  return result.status === 0;
};

const results = [];

for (const gate of GATES) {
  console.log(`\n=== ${gate.id} — ${gate.covers} ===`);
  const steps = gate.steps ?? [gate.command];
  let ok = true;
  for (const step of steps) {
    if (!run(step)) {
      ok = false;
      break;
    }
  }
  results.push({ ...gate, ok });
}

console.log("\n──────────────────────────────────────────────────────────────");
console.log("Gate matrix (PRD-windows-dictation-delivery-brownfield §8)");
console.log("──────────────────────────────────────────────────────────────");
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.id}  ${r.covers}`);
}
console.log("PASS  G-D6  Dom smoke is not a merge gate (process — see docs/DESIGN/WINDOWS_DELIVERY_GATES.md)");

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.error(`\nvalidate:gates FAIL — ${failed.map((r) => r.id).join(", ")}`);
  process.exit(1);
}
console.log("\nvalidate:gates PASS — all floor gates green; no human smoke required.");
