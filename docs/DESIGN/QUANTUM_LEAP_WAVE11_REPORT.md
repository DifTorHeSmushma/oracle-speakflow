# Wave 1.1 — Pure Services Implementation Report

**Date:** 2026-07-07
**Branch:** feat/quantum-leap-v1
**Commit:** b0b57dc
**Authority:** QUANTUM_LEAP_SPEC.md §10 Wave 1.1 (D1 approved, S1 PASSED)

---

## Gate Results

| Gate | Command | Result |
|------|---------|--------|
| **G1** | `npm run typecheck` | ✅ **0 errors** |
| **G2** | `npm test` | ✅ **132/132 pass** (up from 44 prior to Wave 1.1) |
| **G8** | `tests/correction.test.ts` (16 tests) | ✅ deterministic + dictionary-last + p95 < 1ms (well under 50ms budget) |
| **G9** | `tests/dictionary.test.ts` (15 tests) | ✅ CRUD / import / export / schema-validate / last-good backup |
| **G10** | `tests/paste.test.ts` (21 tests) | ✅ full ladder, muted→block, 0 wrong-target |
| **G12** | `tests/config-migration.test.ts` (10 tests) | ✅ v2→v3 preserves key/hotkey; handsFree default |

G3/G4/G5/G6 (UI/build/integration/MCP): not required this wave; existing tests confirm no regression.

---

## Files Created

| File | Purpose |
|------|---------|
| `src/types/voice.ts` | `VadConfig`, `VoiceMode`, `Dictionary`, `DictEntry`, `CorrectionConfig`, `VadError` types |
| `src/services/capture.ts` | Continuous FFmpeg s16le capture, 512-sample reframing, 300-frame ring buffer, WAV header writer |
| `src/services/vad.ts` | Silero v5 via onnxruntime-node; SHA-256 hard-block (A4); debounce + hangover state machine; `FRAME_SAMPLES=512` exported |
| `src/services/correction.ts` | Deterministic step 1 (whitespace norm) + step 2 (52-term dev casing map); step 4 (dictionary-last, authoritative); step 3 LLM off by default |
| `src/services/dictionary.ts` | JSON CRUD at `userData/dictionary.json`; schema validation; last-good backup (.bak) before overwrite; import/export; `applyDictionary` word-boundary replacer |
| `src/services/paste.ts` | Pure `decidePaste` decision ladder; `classifyTarget` built-in classifier; `ForegroundInfo`, `TargetClassifier` types |
| `src/services/mute.ts` | Module-level mute state; `setUserMute`/`setCallAppMute`/`setMicBusy`; `onMuteChange`; `isCallAppActive`; default 4-app allowlist (A5) |
| `tests/vad.test.ts` | Mocked ORT + binaryPath; state machine tests; tensor shape assertions per S1 schema; mute hard-gate; stateN threading |
| `tests/correction.test.ts` | Whitespace norm, dev-term casing, dictionary-last, p95 perf (<50ms) |
| `tests/dictionary.test.ts` | load/save round-trip, backup, invalid JSON/schema, import/export, applyDictionary |
| `tests/paste.test.ts` | All ladder branches, zero wrong-target guarantee, classifyTarget |
| `tests/mute.test.ts` | State transitions, listener, allowlist (msedgewebview2 NOT in default) |
| `tests/config-migration.test.ts` | G12: handsFree default on new install and v2→v3; preserves GROQ_API_KEY/hotkey; idempotent |

## Files Modified

| File | Change |
|------|--------|
| `src/utils/binaryPath.ts` | Added `getVerifiedModelPath(name)`: resolves path, reads `models.sha256` manifest, computes SHA-256, hard-blocks on mismatch (A4 / Invariant #13 parity) |
| `src/utils/config.ts` | `Config` extended with `voiceMode`, `vad`, `correction`, `callAppAllowlist`, `terminalVariantEnabled`; `migrateConfigV3` exported (G12); `saveConfig` handles all new keys; `CONFIG_VERSION="3"`, `DEFAULT_VAD_CONFIG`, `DEFAULT_CORRECTION_CONFIG`, `DEFAULT_CALL_APP_ALLOWLIST` exported |
| `src-ui/utils/waveform.ts` | Deleted dead `startWaveform()` (`getUserMedia`) per S1 recommendation — Invariant #17 compliance; `startProceduralWaveform()` and `drawFlatLine()` retained |

---

## S1 Schema Compliance (vad.ts)

Per S1 spike report — tensor shapes matched exactly:

| Tensor | Direction | Type | Shape | Implementation |
|--------|-----------|------|-------|----------------|
| `input` | in | Float32 | **[1, 512]** | `new ort.Tensor("float32", Float32Array.from(frame), [1, 512])` |
| `state` | in | Float32 | **[2, 1, 128]** | `new ort.Tensor("float32", Float32Array.from(state), [2, 1, 128])` — threaded `stateN → state` per frame |
| `sr` | in | Int64 | **[1]** | `new ort.Tensor("int64", BigInt64Array.from([16000n]), [1])` |
| `output` | out | Float32 | [1, 1] | `outputs["output"].data[0]` → speech probability |
| `stateN` | out | Float32 | [2, 1, 128] | `Float32Array.from(outputs["stateN"].data)` → fed as `state` next frame; reset to zeros on `stop()` |

State size: `2 × 1 × 128 = 256 Float32 elements`. Reset on `stop()` — no state leaks across utterances.

The ORT import was changed from `createRequire` (CJS bypass) to ESM `import * as ort from "onnxruntime-node"` to allow vitest `vi.mock("onnxruntime-node")` interception. In production Electron, ESM imports resolve through the same ASAR-unpacked native binding mechanism as require (confirmed by ORT's internal `__dirname`-based resolution, not our code's `__dirname`).

---

## Architecture Notes

**Invariant #17 (single mic owner):** `startWaveform()` (the only `getUserMedia` call in the entire codebase) has been deleted. The active renderer path now has zero `getUserMedia` calls — `StatusBar.svelte` uses `startProceduralWaveform()` only.

**Invariant #19 (no paste/record while muted):** `vad.ts` hard-checks `getMuteState().muted` before processing each frame. `decidePaste` returns `{ action: "block" }` whenever `muted === true` (asserted in G10).

**Invariant #13 (A4 model integrity):** `getVerifiedModelPath()` in `binaryPath.ts` reads `resources/bin/models.sha256`, finds the SHA-256 for the requested model, computes the actual file hash, and returns `Err({ kind: "modelIntegrity" })` on mismatch. `createVad` propagates this as a hard-block — no silent fallback.

**Dictionary authoritative (Spec §6.2):** `applyDictionary` is called LAST in `correction.ts`, after whitespace normalization and dev-term casing. Case-insensitive regex on `spoken` form means dictionary entries override even after dev-term transforms.

**A5 call-app allowlist:** Default is exactly `["Zoom.exe", "Teams.exe", "ms-teams.exe", "Discord.exe"]`. `msedgewebview2.exe` is deliberately absent (asserted in mute tests).

---

## Remaining Risks for Wave 2

| Risk | Severity | Notes |
|------|----------|-------|
| `vad.ts` uses ESM `import * as ort` — verify native binding resolution in packaged Electron during Wave 2 integration test | Medium | S1 confirmed packaged path works via `process.resourcesPath`; ESM import should resolve same way, but needs G5 smoke after Electron wiring |
| ORT `InferenceSession.create()` async first-call latency (~50–200ms) happens at `createVad()` call site — must be invoked at startup, not per-utterance | Low | Wave 2: call `createVad()` once during Electron app startup |
| `vad.ts` `getMuteState` parameter coupling — Wave 2 must pass `getMuteState` from `mute.ts` at call site | Low | Intentional design: keeps `vad.ts` pure (no global import of `mute.ts`) |
| `capture.ts` `stop()` returns `Promise<void>` synchronously — no error propagation from FFmpeg teardown | Low | Best-effort teardown is intentional; errors logged to stderr |
| Config migration test env cleanup — `process.env` keys must be restored in `afterEach` across all test files that touch config | Medium | Current tests do restore all keys; future tests must maintain this discipline |

---

## STOP — Wave 1.1 Complete

All deliverables committed on `feat/quantum-leap-v1`. Awaiting human authorization for Wave 2 (Electron wiring: continuous capture, VAD→state machine, `decidePaste` inline, mute kill-switch, `win32-window.ts`).
