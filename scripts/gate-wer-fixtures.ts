#!/usr/bin/env tsx
/**
 * Gate G-W1 — WER / meaning fixture pack (issue #12).
 *
 * Runs the Dom HITL pair and SDLC/product fixtures through `correct()`, then scores
 * WER + meaning errors against INTENT bars (≤5% target; hard-fail >10% or >2 meaning/10).
 * No microphone — Dom is not the debug loop.
 */
import { correct } from "../src/services/correction.js";
import {
  WER_FIXTURE_PACK,
  meaningError,
  wordErrorRate,
  DOM_HITL_SPEAKFLOW_LINE,
} from "../src/services/transcriptQuality.js";
import type { Dictionary, CorrectionConfig } from "../src/types/voice.js";

const EMPTY_DICT: Dictionary = { version: 1, entries: [] };
const CFG: CorrectionConfig = { llmEnabled: false, llmLatencyBudgetMs: 200 };

const WER_TARGET = 0.05;
const WER_HARD_FAIL = 0.1;
const MEANING_HARD_FAIL = 2;

async function main(): Promise<number> {
  const rows: {
    id: string;
    wer: number;
    meaning: boolean;
    corrected: string;
  }[] = [];

  for (const fix of WER_FIXTURE_PACK) {
    const { text } = await correct(fix.rawHypothesis, EMPTY_DICT, CFG);
    const wer = wordErrorRate(fix.reference, text);
    const meaning = meaningError(fix.reference, text);
    rows.push({ id: fix.id, wer, meaning, corrected: text });
  }

  const avgWer = rows.reduce((s, r) => s + r.wer, 0) / rows.length;
  const meaningCount = rows.filter((r) => r.meaning).length;
  const dom = rows.find((r) => r.id === "dom-hitl-speakflow");

  console.log("G-W1 fixture results:");
  for (const r of rows) {
    console.log(
      `  ${r.meaning ? "MEANING" : "ok     "} wer=${(r.wer * 100).toFixed(1)}%  ${r.id} → ${JSON.stringify(r.corrected.slice(0, 80))}`
    );
  }
  console.log(
    `G-W1 aggregate WER=${(avgWer * 100).toFixed(1)}% (target ≤${WER_TARGET * 100}%, hard-fail >${WER_HARD_FAIL * 100}%)`
  );
  console.log(`G-W1 meaning errors=${meaningCount}/10 (hard-fail >${MEANING_HARD_FAIL})`);

  if (!dom) {
    console.error("G-W1 FAIL — Dom HITL fixture missing");
    return 1;
  }
  if (dom.corrected.toLowerCase().includes("speed flow")) {
    console.error("G-W1 FAIL — Dom pair still contains 'speed flow' after correction");
    return 1;
  }
  if (dom.corrected.toLowerCase().includes("tested it here")) {
    console.error("G-W1 FAIL — Dom pair still contains invented filler");
    return 1;
  }
  if (!/speakflow/i.test(dom.corrected)) {
    console.error("G-W1 FAIL — Dom pair missing SpeakFlow after correction");
    return 1;
  }
  if (dom.meaning) {
    console.error(`G-W1 FAIL — Dom pair still a meaning error vs ${JSON.stringify(DOM_HITL_SPEAKFLOW_LINE)}`);
    return 1;
  }
  if (avgWer > WER_HARD_FAIL) {
    console.error(`G-W1 FAIL — aggregate WER ${(avgWer * 100).toFixed(1)}% > ${WER_HARD_FAIL * 100}%`);
    return 1;
  }
  if (meaningCount > MEANING_HARD_FAIL) {
    console.error(`G-W1 FAIL — ${meaningCount} meaning errors > ${MEANING_HARD_FAIL}`);
    return 1;
  }
  if (avgWer > WER_TARGET) {
    console.log(
      `G-W1 WARN — aggregate WER ${(avgWer * 100).toFixed(1)}% above ${WER_TARGET * 100}% target (below hard-fail)`
    );
  }

  console.log("G-W1 PASS — fixture pack honest green (Dom pair included); not claiming live-mic locked");
  return 0;
}

main()
  .then((c) => process.exit(c))
  .catch((err: unknown) => {
    console.error(`G-W1 FAIL — ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
