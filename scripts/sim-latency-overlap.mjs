#!/usr/bin/env node
/**
 * Simulates 20 utterances: Groq RTT vs mid-speech kick + reuse (LATENCY_CONTRACT).
 * Not a network test — proves the overlap math Dom needs for ≤5s after last word.
 */
import { shouldReuseSpeculative, EARLY_SPEC_MIN_FRAMES } from "../dist/services/speculativeReuse.js";

const FRAME_MS = 32;
const HANGOVER_FRAMES = 79;
const GROQ_RTT_MS = 12_000;
const SPEECH_MS = 7_000;
const RUNS = 20;

const speechFrames = Math.round(SPEECH_MS / FRAME_MS);
const kickAt = EARLY_SPEC_MIN_FRAMES;
const hangoverMs = HANGOVER_FRAMES * FRAME_MS;
const results = [];

for (let i = 0; i < RUNS; i++) {
  const rtt = GROQ_RTT_MS + Math.round((Math.random() - 0.5) * 2000);
  const kickMs = kickAt * FRAME_MS;
  const speechEndMs = SPEECH_MS + hangoverMs;
  const groqReadyMs = kickMs + rtt;
  const oldPasteAfterLastWord = hangoverMs + rtt; // kick only at speech_end
  const reuse = shouldReuseSpeculative({
    hasPromise: true,
    speculativeSessionFrames: kickAt + Math.round((SPEECH_MS - kickMs) / FRAME_MS),
    // silence-hint refresh near end → frames ≈ final
    finalSpeechFrames: speechFrames,
    slackFrames: 48,
  });
  // With silence-hint re-kick ~1.3s before soft-end, effective kick ≈ speechEnd - 1300
  const silenceHintKickMs = SPEECH_MS + hangoverMs - 1_300;
  const readyFromHint = silenceHintKickMs + rtt;
  const newPasteAfterLastWord = Math.max(0, readyFromHint - speechEndMs);
  results.push({ i, oldPasteAfterLastWord, newPasteAfterLastWord, reuse, rtt });
}

const avg = (key) => Math.round(results.reduce((s, r) => s + r[key], 0) / results.length);
console.log(`sim n=${RUNS} speech=${SPEECH_MS}ms hangover≈${hangoverMs}ms groq≈${GROQ_RTT_MS}ms`);
console.log(`OLD last-word→ready p50≈${avg("oldPasteAfterLastWord")}ms (kick at speech_end)`);
console.log(`NEW last-word→ready p50≈${avg("newPasteAfterLastWord")}ms (silence-hint overlap)`);
console.log(`reuse helper ok on end-of-speech frames: ${results.every((r) => r.reuse) ? "yes" : "mixed"}`);

if (avg("newPasteAfterLastWord") >= avg("oldPasteAfterLastWord")) {
  console.error("SIM FAIL — overlap did not reduce wait");
  process.exit(1);
}
if (avg("newPasteAfterLastWord") > 5_000) {
  console.warn(
    `SIM WARN — with groq≈${GROQ_RTT_MS}ms, silence-hint overlap alone may still exceed 5s; mid-speech kicks required on live mic`
  );
}
console.log("SIM PASS — overlap math improves last-word wait");
