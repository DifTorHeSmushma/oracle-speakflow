# Latency contract — last-word → Cursor (no drift)

**Issue track:** #13 (latency) · do not conflate with #8 streaming mega-rewrite  
**Authority for accuracy/delivery:** leave #11/#12 paths alone unless this contract says otherwise.

## Want

| # | Requirement |
|---|-------------|
| W1 | Correct-enough text pastes into **Cursor** (delivery already proven). |
| W2 | After last word, text lands with **`pasteCompleteMs ≤ 5000`** on Dom live mic (log row for that utterance). |
| W3 | Free/OSS path only — **no paid streaming vendor** required for this contract. |
| W4 | Keep pause floor: `redemptionFrames=79` (~2.5s) — no false finalize on ≤2s pause. |

## Do not want / do not touch

| # | Forbidden |
|---|-----------|
| D1 | Declaring DONE from synthetic `SPEAKFLOW_SMOKE_WAV` alone. |
| D2 | Changing SpeakFlow lexicon / FINALIZE_PROMPT / hallucination ×2 rules for “speed”. |
| D3 | Changing Cursor restore+Ctrl+V delivery ladder for “speed”. |
| D4 | Lowering `redemptionFrames` below 79. |
| D5 | Scope creep into HUD (#7), Deepgram-required MVP, or full streaming rewrite in this slice. |
| D6 | Stacking unrelated VAD/hygiene fixes in one “latency fixed” claim. |

## Where we were (evidence)

- Paste/delivery: can work (`delivered: true`, keystroke).
- Live `pasteCompleteMs` often **16–24s**; `transcribeWallMs` / `specWaitMs` **~12–20s**.
- Same `transcribeFinalize` outside Electron: **~1s**. Inside live Electron: **~12–18s**.
- Root causes (stacked):
  1. Mid-speech speculative was gated on `streamingFrameArmed` → **never kicked** without Deepgram/STREAMING_INSERT; only silence-hint ran.
  2. Silero ORT on the Electron **main thread** starved Groq fetch completions.
  3. Mid-speech `gen++` refresh killed in-flight overlap when kicks did run.

## Mechanism (this slice only)

**Overlap:** kick Groq finalize **during speech** (~every 1.5s after 2s) + at silence hint; at speech_end **reuse** in-flight result when session frames are close enough. Do not throw away a finished/near-finished call and start a second full RTT.

**Physics (honest):** `pasteCompleteMs ≈ max(0, groqRTT − overlapMs)`. If live Groq is ~12s, silence-hint-only overlap (~1.3s) cannot hit ≤5s; mid-speech kicks + reuse are required. If live Groq stays ≫10s even with overlap, the ≤5s bar needs free streaming/local (#8) — not more batch tricks.

## Proof

| Gate | Pass |
|---|---|
| Automated | `npm run check:latency-overlap` — N synthetic settles; report p50/p90 `pasteCompleteMs` |
| Dom (optional) | One Cursor utterance; that row `pasteCompleteMs ≤ 5000` + text OK |

**Never** say fixed without an automated gate green; Dom confirmation only upgrades “ship for Dom daily use.”
