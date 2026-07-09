# M6 Public-Launch Parity — Engineering Spec (Oracle SpeakFlow)

**Date:** 2026-07-08
**Author:** Opus 4.8 (Spec lane — Session 3, Spec only; reads C1 PRD cold)
**Status:** ✅ **Gate D1 APPROVED (2026-07-08)** — DOM approved §0–§13 (all D1 checklist YES; amendments: none). Implementation may begin, but **Wave 1.0 (S1-M6 residency + bundling spike) runs FIRST** and remains STOP-gated.
**Authority (read from disk, in order):**
- Approved Intent: `docs/DESIGN/INTENT-m6-public-launch-parity.md` (Gate B0, 2026-07-08) — C-1…C-10
- Approved PRD: `docs/DESIGN/M6_PUBLIC_LAUNCH_PRD.md` (Gate C1, 2026-07-08) — L1–L15, §8 deferral, §9 open questions
- Wargame: `docs/DESIGN/WARGAME-m6-public-launch-parity.md` (8.3/10 — S1–S18, B0.2 parity bar)
- STORM: `docs/DESIGN/storm-reports/speakflow-public-launch-parity-2026-briefing.md` (5/5 verified; F1–F5, close-the-gap a–e)
- Repo law: `CLAUDE.md` (invariants #1–#19)
- House style: `docs/DESIGN/QUANTUM_LEAP_SPEC.md` (Spec altitude; G1–G12; §9b re-review format)
- Brownfield: `transcription.ts`, `electron-main.ts`, `binaryPath.ts`, `paste.ts`, `config.ts`, `package.json`

**Altitude:** *How.* File paths, module contracts, data schemas, timings, gates, waves. Intent/what-why lives in the PRD.

> This Spec **resolves PRD §9 Open Questions 1–7** (§0), honors all **L1–L15** (§0.1), meets the **B0.2 parity bar**, carries the **C-10/L9 CI-runner policy** (§6), extends the Quantum Leap gate matrix to **G13–G26** (§8), and sequences **five STOP-gated waves** — Wave 1.0 residency/latency/bundling spike first (§10). It **stops at Gate D1.**

---

## 0. Resolution of PRD §9 Open Questions

### Q1 — Exact quantization variants + measured default tier (PRD §9.1, L3/L11)

**Decision — three-tier ladder, pinned to STORM-verified whisper.cpp filenames.** All weights MIT (Whisper). Default tier is **spike-decided** (Wave 1.0 / S1-M6), never assumed.

| Tier | `ggml` filename (whisper.cpp HF) | Size (verified STORM F2) | Source | Min RAM guidance | Default policy |
|---|---|---|---|---|---|
| **Fast** | `ggml-tiny.en.bin` | 77.7 MB | **shipped in installer** (`resources/bin`) | ~0.5 GB | **Fallback default** — always available offline, batch-spawn OK |
| **Balanced** | `ggml-small.en-q5_1.bin` | 190 MB | one-click download, SHA-gated | ~1.0 GB | **Recommended default IFF S1-M6 residency latency passes** on reference hardware; else opt-in |
| **Accurate** | `ggml-large-v3-turbo-q5_0.bin` | 574 MB | one-click download, opt-in | ~2.0 GB | **Never** auto-default; size + RAM shown before download |

- Reference hardware for the spike/latency contract: **DOM's dev machine** (Windows 11, the machine of record for the <800 ms local budget from Quantum Leap Q5). Pass thresholds in §10 Wave 1.0.
- **Latency contract (L11):** a tier above Fast becomes the *default* only if warm capture-end→text ≤ **800 ms p95** on reference hardware (Quantum Leap NFR budget, unchanged). Batch-spawn-per-utterance is acceptable **for Fast only**.

### Q2 — Resident-engine lifecycle contract (PRD §9.2, L11; Wargame S15)

**Decision — a resident local engine (`localEngine.ts`) owns one long-lived whisper.cpp process per active tier.** The current `transcribeLocal` `spawnSync`-per-utterance reloads the full model every cycle (STORM F2: seconds at 190/574 MB — budget violation); residency dissolves that. Residency is **spike-gated** — if S1-M6 fails, Fast/batch stays the only default and Balanced/Accurate remain opt-in with honest latency copy (PRD §3 P2 downgrade).

- **Engine binary:** `whisper-server.exe` (whisper.cpp's resident HTTP inference server; loopback `127.0.0.1:<ephemeral>`, model held warm in RAM). Bundled alongside `whisper-cli.exe` via `extraResources`. `whisper-cli.exe` is retained for the Fast batch path and as the S1-fallback engine.
- **Lifecycle (Invariant #8 — async cleanup on shutdown):**
  - `startEngine(tier, verifiedModelPath)` — spawn, bind ephemeral port, poll `/health` until ready or timeout (5 s) → `Result<EngineHandle, EngineError>`.
  - `transcribeWarm(handle, wavBuffer)` — POST WAV to `/inference`, parse text → `Result<string, TranscriptionError>`.
  - `stopEngine(handle)` — **idempotent** (guards a `stopped` flag, mirrors `recorder.ts` Invariant #7); kills the child, awaits exit. Called on app quit (`before-quit`, `await`-ed before `process.exit`), on tier switch, and on kill-switch.
  - **Idle-unload policy (S15):** an idle timer unloads the engine after **5 min** with no inference (frees model RAM). Next utterance transparently restarts it (cold-start counted against the *first* utterance only, surfaced honestly).
  - **Mute/kill-switch (C-5/#19):** kill-switch → `stopEngine()` (release RAM, mirror mic-device close). No inference while muted regardless of engine warmth.
- **Zombie protection (S15):** engine PID tracked; `before-quit` and `SIGINT`/`SIGTERM` handlers kill it; on unexpected engine exit, classify as `localTranscriptionFailed`, hard-block, **never** silent cloud (C-7/L5).

### Q3 — Prior-external-foreground tracker + yield-focus timings + M-3 protocol (PRD §9.3, L6; Wargame S5–S9)

**Decision — the yield-focus ladder runs in the orchestration layer (electron-main), fed by a stateful tracker; `decidePaste`/`decideYield` stay pure and unit-tested.** SpeakFlow only ever **gives focus away** (`win.hide()`); it never activates any window (no `SetForegroundWindow` — L7/#18, mechanized by G19).

- **Tracker (`foregroundTracker.ts`):** piggybacks the **existing 1 s foreground poll** already running while LISTENING/armed (Quantum Leap §5; validates Intent A-4 — no new native deps). Each tick records the last **external** (non-SpeakFlow) `ForegroundInfo` with a monotonic timestamp. Own-window ticks are ignored for the "prior target" slot.
- **Capture instant:** at record-cycle start — VAD `speechStart` (hands-free) / `keydown` (PTT) — snapshot `capturedExternalForeground` (the freshest external sample, plus its age).
- **Yield ladder (at inject, only when `ownHwndEquals === true`):**
  1. **Staleness gate** — `capturedExternalForeground` sample age must be ≤ **2000 ms**; older → clipboard+toast (no yield).
  2. **Liveness gate** — recorded prior HWND must still be a window (`IsWindow`); dead/closed → clipboard+toast (S6).
  3. **Yield** — `win.hide()` (focus given away; OS re-activates prior z-order window). SpeakFlow activates nothing.
  4. **Settle delay** — **120 ms** single settle (tunable constant `YIELD_SETTLE_MS`; spike/smoke-validated in G18).
  5. **Re-verify** — re-read `getForegroundInfo()`; require **strict HWND equality** `foreground.hwnd === capturedExternalForeground.hwnd`. One re-check; total settle budget ≤ **500 ms** (`YIELD_MAX_WAIT_MS`).
  6. **Decide** — match → `decidePaste(...)` (which *still* runs its retained `ownHwndEquals` final gate, S8) → keystroke. Any mismatch/timeout → clipboard+toast, **never** a keystroke on partial evidence (S5/S9).
- **When SpeakFlow is *not* focused at inject** — unchanged Quantum Leap path (`decidePaste` guard ladder); no yield needed.
- **M-3 smoke protocol (mirrors Quantum Leap G7):** SpeakFlow window **open and focused** at dictation start; 10 consecutive dev utterances; **pass = ≥9/10 land in the prior external target, 0 into SpeakFlow.** Measured on reference hardware; `t1−t0` latency logged to stderr (no transcript text). Timings above are the tuning knobs if <9/10.

### Q4 — macOS CI workflow shape (PRD §9.4, L8/L9/L10; STORM F3/F4; Wargame S10/S14/S18)

**Decision — two workflows, strict trigger separation (see §6 for the full policy).**
- `.github/workflows/ci.yml` — **Windows + Linux** gate matrix, `on: [push, pull_request]` (free runners). Full Quantum Leap G1–G12 + M6 auto gates. **Must be green before any Mac trigger.**
- `.github/workflows/mac-package.yml` — **macOS**, `on: workflow_dispatch` + `on: push: tags: ['v*']` **ONLY**. Never `push`/`pull_request` (mechanized by G24).
- **Caching (F4 mandate):** `actions/cache` for npm (`~/.npm`, keyed on `package-lock.json`), Electron/electron-builder caches (`~/Library/Caches/electron`, `~/Library/Caches/electron-builder`), and models (keyed on `resources/bin/models.sha256`) so each deliberate Mac run is not a cold-download tax.
- **Artifact form:** `dmg` **and** `zip` (zip is the reliable Gatekeeper-smoke vehicle). **Ad-hoc signature** via electron-builder `mac.identity: null` (STORM R11 *cited-unverified* → **the first `mac-package` run must validate an ad-hoc signature is present and the app launches via Open Anyway** before Wave 4 is green — this is the Wave 4 embedded spike).
- **Gatekeeper launch-smoke** — written script `scripts/mac-launch-smoke.md`: download zip → `xattr -cr <App>.app` (or System Settings → Privacy & Security → Open Anyway, once) → launch → reach transcription (cloud path minimum) → screenshot. Sequoia removed Control-click bypass (STORM F3 verified) — the script names the sanctioned steps.
- **Secrets/paths hygiene (C-9/S18):** artifact review step asserts no `.env`, no absolute user paths in the bundle; CI logs scrubbed of secrets; `identity: null` produces no signing-identity leakage.

### Q5 — Per-tier SHA manifest + release-blocking no-unverified-hash check (PRD §9.5, L4; Wargame S2/S3)

**Decision — one manifest, one gate, both code paths verify through it.** The current split (inline `MODEL_SHA256` in `electron-main.ts` with `TODO(M2-ship)` **vs** `getVerifiedModelPath` + `models.sha256`) is unified: the inline constant is **deleted**; all tiers verify via `getVerifiedModelPath` against `resources/bin/models.sha256`.

- **Manifest format** — unchanged shasum form (`binaryPath.ts::parseManifestEntry` already parses `<HASH>  <filename>`). Three real entries authored at Spec-implementation time:
  ```
  <64-hex>  ggml-tiny.en.bin
  <64-hex>  ggml-small.en-q5_1.bin
  <64-hex>  ggml-large-v3-turbo-q5_0.bin
  ```
- **Release-blocking CI check (`scripts/check-manifest.mjs`, G14):** fails if any manifest hash is not exactly 64 hex chars, if the literal `TODO` appears anywhere in the manifest, or if a `SHA256`/`MODEL_SHA256` string literal reappears in `electron-main.ts`. This kills the `TODO(M2-ship)` class **permanently** — no unverified hash ever ships (L4).
- **Both paths gated:** the downloader verifies the completed file via `getVerifiedModelPath` (not an inline constant), and `transcribeLocal` **pre-flight-verifies** the resolved tier model before every engine start (today it does not verify at all — closed here per C-2).

### Q6 — Disk/RAM pre-checks + download cancel/retry (PRD §9.6; Wargame S4/S16/S17)

- **Disk pre-check** — before offering/starting a tier download: require free space ≥ **2× model size** (`checkDiskSpace` via `fs.statfs` on the `userData/models` volume). Insufficient → block download with actionable message; never a stuck stream.
- **RAM guidance** — Accurate selection surfaces the min-RAM figure (Q1 table) as a pre-download notice (informational, not a hard block; the resident engine's own failure is the hard gate).
- **Download semantics (atomic, cancellable — S16/S17):** stream to `<filename>.part`; on `finish`, SHA-verify via manifest; **verify-then-rename** to the final name (never a half-file at the real path). Cancel via `AbortController` on the `https.get` request (cancel deletes `.part`). Retry with backoff (500 ms → 1 s → 2 s, 3 attempts). Resume is **not** required — restart-from-zero is acceptable (matches the existing partial-delete behavior). Tier switch/download apply **only from IDLE/LISTENING** (Invariant #6 — S16); switches denied while a pipeline cycle is active.
- **Offline first-run is never dead (L2):** Fast tier ships in the installer, so a networking-disabled fresh install transcribes with zero downloads (thin-slice guarantee).

### Q7 — M-2 measurement protocol (PRD §9.7)

- **Fixed script:** `docs/DESIGN/M6_M2_DEV_VOCAB_SCRIPT.md` — 10 utterances dense in dev vocabulary `tiny.en` reliably mistranscribes, e.g.: `"npm install typescript"`, `"async await Promise dot all"`, `"kubectl get pods dash n namespace"`, `"git rebase dash i HEAD tilde three"`, `"const app equals require express"`, `"SELECT star FROM users WHERE id"`, `"docker compose up dash d"`, `"import React from react"`, `"HWND clipboard SIGINT stderr"`, `"pnpm run build colon UI"`.
- **Method:** speak each utterance **once per tier** on reference hardware, offline; count **word-level errors on the target dev tokens** (the protected-vocab words above), report **errors/tier**. Pass (M-2) = Balanced and/or Accurate **measurably reduce** the Fast-tier error count. Results table pasted into the Wave-2 gate record and the README claims table (M-7).

---

## 0.1 — Locked decisions L1–L15 honored

| L# | Decision | Where satisfied in this Spec |
|---|---|---|
| L1 | whisper.cpp stays; sidecar in installer | §0 Q1/Q2, §5 (`extraResources`), §11 |
| L2 | Hybrid distribution (Fast in installer; Balanced/Accurate one-click) | §0 Q1/Q6, §3 `modelRegistry` |
| L3 | Three-tier ladder, sizes/licenses | §0 Q1 table |
| L4 | Per-tier SHA gate; no unverified hash ever ships | §0 Q5, G14, `check-manifest.mjs` |
| L5 | No silent cloud; opt-in persisted, off by default | §0 Q2, §4.4, G13 |
| L6 | Yield-focus ladder | §0 Q3, §4, G18/G19/G20 |
| L7 | M-4 mechanized grep-gate | §4.3, §6, G19 |
| L8 | macOS = proof not parity | §0 Q4, §6, Wave 4 |
| L9 | macOS CI dispatch/tags only; caching; Windows-green-first | **§6 (dedicated CI policy)**, G24 |
| L10 | Ad-hoc launch + documented Gatekeeper steps | §0 Q4, `mac-launch-smoke.md` |
| L11 | Latency contract; residency spike-gated | §0 Q1/Q2, §10 Wave 1.0 |
| L12 | No Windows regression by construction | §7, G25, additive/branching |
| L13 | New UI obeys component density; mic/mute untouched | §5.3, G3 |
| L14 | GPU out this cycle | §1 Out |
| L15 | README honesty pass ships in-milestone | §10 Launch polish, G-M7 |

---

## 0.2 — Parity bar (Wargame B0.2, unchanged — this Spec must clear it)

The relevant M6 deltas: **out-of-box offline (MATCH+, engine+Fast in installer, zero downloads), tier ladder (MATCH), model integrity SHA-gate all tiers (BEAT), paste yield-focus + 0-into-self floor + no-foreground-steal grep-gate (BEAT), macOS CI-proven-launchable (DELIBERATELY PARTIAL — proof this cycle, parity M7).** GPU / streaming / notarized installers = deliberately NOT this cycle.

---

## 1. Scope

**In:** bundle `whisper-cli.exe` + `whisper-server.exe` (+ runtime DLLs) + `ggml-tiny.en.bin` via `extraResources`; three-tier model registry + one-click SHA-gated downloader (disk/RAM checks, cancel/retry); resident local engine (spike-gated) with idempotent lifecycle; unify model integrity through the manifest + release-blocking no-unverified-hash CI check; paste-while-focused yield-focus ladder + M-4 grep-gate; tier-picker / download / first-run-local UI; config migration v4 (`modelTier`); macOS CI (dispatch/tags) that builds, ad-hoc-signs, launches, reaches cloud transcription; README honesty pass.

**Out (deferred — PRD §7, deferral order §8):** full macOS/Linux native paste/hotkey/mic parity (M7); Linux (M7); GPU (L14); Parakeet / in-process ONNX consolidation (M7 6th-lens); winget/Homebrew/notarized/signed installers/auto-updater; streaming/diarization; multi-language correction.

---

## 2. Architecture delta

```
                 ┌──────────────────── BEFORE (M5 / current) ────────────────────┐
 local path:  transcribe(mode="local") ─► transcribeLocal(): spawnSync whisper-cli
                   │  model reloads EVERY utterance (budget violation for >tiny)
                   │  NO SHA verify on the local model (C-2 gap)
                   │  whisper-cli.exe NOT bundled → user hand-places it (Invariant #15 VIOLATION, P1)
 downloader:  electron-main download-model ─► inline MODEL_SHA256 = "…" // TODO(M2-ship)  ← unverified (P2, S3)
 paste:       own-window focused ─► decidePaste ─► clipboardToast (P3: dictate-while-glancing broken)
 platform:    package.json mac:{dmg} STUB; NO .github/workflows; no artifact (P4)

                 ┌──────────────────── AFTER (M6) ────────────────────┐
 BUNDLED LOCAL + TIERS
   resources/bin/  whisper-cli.exe · whisper-server.exe · *.dll · ggml-tiny.en.bin · models.sha256(3 entries)
        │
   modelRegistry.ts  TIER_LADDER · resolveTierModel(tier): bundled(resources/bin) → userData/models
        │                        · getVerifiedModelPath (SHA hard-block, all tiers)  L4/C-2
   modelDownloader.ts  .part → SHA-verify → rename · disk pre-check · cancel/retry   L2/Q6
        │
   localEngine.ts  resident whisper-server (warm model, loopback) · idempotent stop · idle-unload · kill-on-quit  #8/L11
        │  (Fast tier may batch via whisper-cli; >Fast requires residency, spike-gated)
        ▼
   transcription.ts  transcribe(mode="local") ─► resolveTierModel → (warm | batch) ─► Result   NEVER cloud on fail  L5/C-7

 PASTE-WHILE-FOCUSED (yield-focus)
   foregroundTracker.ts  piggyback existing 1s poll → last EXTERNAL foreground (+age)   A-4, no new deps
        │  capture at speechStart/keydown
        ▼
   electron-main inject:  ownHwndEquals? ─► staleness≤2s · IsWindow · win.hide() (YIELD) · settle 120ms · re-verify strict HWND ==
        │                                     match → decidePaste (retains own-window final gate) → keystroke
        │                                     mismatch/timeout → clipboard+toast          NEVER SetForegroundWindow  #18/L7
        ▼
   yieldFocus.ts (PURE decideYield) + paste.ts (PURE decidePaste)  — unit-tested; only keystroke is human-smoked

 macOS PROOF (CI)
   .github/workflows/ci.yml           win+linux, on push/PR (free), full G1–G12+M6 auto  — green BEFORE mac
   .github/workflows/mac-package.yml  workflow_dispatch + tags ONLY · cached · ad-hoc dmg/zip · launch-smoke  C-10/L9
```

---

## 3. Module contracts — bundled local + tiers

### 3.1 `src/services/modelRegistry.ts` (new — Wave 1.1)

```ts
export type ModelTier = "fast" | "balanced" | "accurate";

export type TierSpec = {
  tier: ModelTier;
  filename: string;          // ggml-*.bin (manifest key)
  sizeBytes: number;         // verified STORM F2
  source: "bundled" | "download";
  url?: string;              // HF resolve URL for downloadable tiers
  minRamMB: number;          // Q1 guidance
  batchAcceptable: boolean;  // true only for Fast (L11)
};

export const TIER_LADDER: Record<ModelTier, TierSpec>;   // Q1 table, frozen

export type ModelResolveError =
  | { kind: "modelNotFound"; message: string }      // tier not present in either dir
  | { kind: "modelIntegrity"; message: string };    // SHA mismatch — HARD-BLOCK (C-2)

/** Bundled (resources/bin) first, then userData/models; verifies via manifest. Hard-block on mismatch. */
export const resolveTierModel = (tier: ModelTier): Result<string, ModelResolveError>;

/** True if the tier's file exists AND verifies. Drives tier-picker availability. */
export const isTierAvailable = (tier: ModelTier): boolean;
```

- Reuses `getVerifiedModelPath` (extended §3.4 to accept a search-dir list). **Missing/mismatch → hard-BLOCK, never silent** (Invariant #13, C-2).

### 3.2 `src/services/modelDownloader.ts` (new — Wave 1.1 pure parts / Wave 2 wiring)

```ts
export type DownloadError =
  | { kind: "insufficientDisk"; needBytes: number; freeBytes: number }
  | { kind: "httpError"; statusCode: number }
  | { kind: "integrity"; message: string }   // post-download SHA mismatch (partial deleted)
  | { kind: "cancelled" }
  | { kind: "networkTimeout"; message: string };

export type DownloadProgress = (pct: number) => void;

/** Streams to <filename>.part → SHA-verify (manifest) → atomic rename. Cancellable via signal. */
export const downloadTier = (
  tier: ModelTier,
  destDir: string,            // userData/models
  onProgress: DownloadProgress,
  signal: AbortSignal,
): Promise<Result<string, DownloadError>>;

/** Free bytes on destDir's volume ≥ 2× model size. */
export const checkDiskForTier = (tier: ModelTier, destDir: string): Result<void, DownloadError>;
```

- Generalizes the existing inline `download-model` handler (electron-main §847). **Verifies via manifest**, not an inline constant. Retry/backoff, partial-delete on failure — preserves brownfield safety, adds cancel + disk gate (S4/S16/S17).

### 3.3 `src/services/localEngine.ts` (new — Wave 1.1 mocked / Wave 2 real; **spike-gated**)

```ts
export type EngineHandle = { pid: number; port: number; tier: ModelTier; stopped: boolean };

export type EngineError =
  | { kind: "engineSpawnFailed"; message: string }
  | { kind: "engineNotReady"; message: string }   // /health timeout (5s)
  | { kind: "enginePortBind"; message: string };

export const startEngine = (tier: ModelTier, verifiedModelPath: string): Promise<Result<EngineHandle, EngineError>>;
export const transcribeWarm = (h: EngineHandle, wav: Buffer): Promise<Result<string, TranscriptionError>>;
export const stopEngine = (h: EngineHandle): Promise<void>;   // idempotent (Invariant #7/#8); safe to call twice
export const armIdleUnload = (h: EngineHandle, idleMs: number, onUnload: () => void): void;   // 5-min default
```

- Loopback `127.0.0.1:<ephemeral>`; POST WAV to `/inference`. `stopEngine` guards `stopped` (returns immediately on second call — Invariant #7 parity). Wired to `before-quit` `await` (Invariant #8) and kill-switch (§4.4/#19). Unit tests mock the child process (G17); real latency is proven only in the S1-M6 spike + G21/G22 smokes.

### 3.4 `src/services/transcription.ts` (modified — Wave 2)

- `transcribeLocal` gains a **tier + pre-flight verify**:
  ```ts
  // was: getBinaryPath("whisper-cli.exe") + spawnSync(model as raw string), NO verify
  // now:
  const model = resolveTierModel(tier);            // Result — HARD-BLOCK on mismatch (C-2)
  if (!model.ok) return Err({ kind: "localModelNotFound"|"localTranscriptionFailed", ... });
  // Fast + batchAcceptable → whisper-cli spawnSync (existing path, verified model)
  // >Fast → localEngine.transcribeWarm(handle, wav)   (resident)
  ```
- `transcribe(...)` signature gains `tier: ModelTier` (defaulted from config). **On any local failure it returns the `Err` — it must never fall through to `transcribeRemote`** (C-7/L5; the `mode` branch stays hard-separated).
- `TranscriptionError` unchanged (`localModelNotFound`/`localTranscriptionFailed` already cover pre-flight + engine failures).

### 3.5 `src/utils/binaryPath.ts` (modified — Wave 1.1)

- `getVerifiedModelPath(name, searchDirs?: string[])` — overload to search an ordered list (`[resources/bin, userData/models]`) instead of only `getBinaryPath`. Manifest resolution and `parseManifestEntry` unchanged. Backward-compatible default preserves the existing single-dir behavior.

### 3.6 `src/electron-main.ts` (modified — Wave 2)

- **Delete** `MODEL_FILENAME` / `MODEL_URL` / `MODEL_SHA256` constants (§39–46) and the inline SHA block in `download-model` (§893–911). Replace with `modelDownloader.downloadTier` + `checkDiskForTier`; verify via manifest.
- New IPC (§5.2): `get-tier-status`, `download-tier`, `cancel-tier-download`, `select-tier`, `check-disk`.
- Engine lifecycle: start on tier-select/first local use; `stopEngine` on `before-quit` (`await`), tier switch, kill-switch. Surgical rule (Quantum Leap A10): **≤ ~200 net new lines**; overflow → `src/services/pipeline.ts`.

---

## 4. Module contracts — paste-while-focused (yield-focus)

### 4.1 `src/services/foregroundTracker.ts` (new — Wave 3)

```ts
export type TrackedTarget = { info: ForegroundInfo; sampledAtMs: number } | null;

/** Called by the existing 1s poll while LISTENING/armed. Own-window samples are ignored. */
export const recordExternalSample = (info: ForegroundInfo, isOwnWindow: boolean, nowMs: number): void;

/** Freshest external target + age; null if none or stale beyond maxAgeMs. */
export const getPriorExternalTarget = (nowMs: number, maxAgeMs: number): TrackedTarget;

export const captureNow = (nowMs: number): TrackedTarget;   // snapshot at speechStart/keydown
```

- No new native deps — consumes `getForegroundInfo()` output already polled (A-4). Pure-ish (module-local state + injected `nowMs` for testability).

### 4.2 `src/services/yieldFocus.ts` (new — Wave 3, PURE)

```ts
export type YieldPlan =
  | { action: "noYield" }                                   // own window not focused — normal path
  | { action: "yieldThenVerify"; expectHwnd: string; settleMs: number; maxWaitMs: number }
  | { action: "clipboardToast"; reason: string };           // stale/dead/no-target — never a keystroke

export const decideYield = (input: {
  ownHwndEquals: boolean;
  captured: TrackedTarget;      // from captureNow at record start
  nowMs: number;
  priorHwndAlive: boolean;      // IsWindow result (injected — side-effect kept in caller)
  staleMs: number;              // 2000
  settleMs: number;             // 120
  maxWaitMs: number;            // 500
}): YieldPlan;
```

- 100% unit-testable (G20). The `win.hide()`, the 120 ms settle timer, and the post-settle `getForegroundInfo()` re-read are executed by the caller (electron-main); the *decision* is pure. `IsWindow` is called by the caller and its boolean injected.

### 4.3 `src/services/paste.ts` (modified — Wave 3)

- **Unchanged pure ladder**, retained as the **final gate after** a successful yield (S8): `ownHwndEquals` still short-circuits to `clipboardToast`, and the strict `hwndMatches` equality still guards the keystroke. The yield ladder *precedes* `decidePaste`; on yield success the caller re-computes `ownHwndEquals`/`foreground` from the post-settle read and passes them in. No new `PasteDecision` variants.
- **M-4 grep-gate (§6, G19):** `SetForegroundWindow`/`AttachThreadInput` forbidden anywhere in `paste.ts`, `yieldFocus.ts`, and the electron-main inject path. The pipeline may only `hide()` its own window during inject; `show()`/`focus()`/`showInactive()` are forbidden *until after* the keystroke/clipboard step completes.

### 4.4 Electron inject wiring (electron-main — Wave 3)

```
inject(transcript):
  fg0 = getForegroundInfo(); ownHwndEquals = nativeHandleEquals(fg0.hwnd, ourHwnd)
  if ownHwndEquals:
    captured = foregroundTracker.captureNow(...)              // snapshot taken at speechStart/keydown
    plan = decideYield({ ownHwndEquals, captured, priorHwndAlive: isWindow(captured.hwnd), ... })
    if plan.action == "clipboardToast": → clipboard + showInactive toast; STOP        (S5/S6/S9)
    if plan.action == "yieldThenVerify":
       win.hide()                                             // YIELD — no activation (#18)
       await settle(plan.settleMs)
       fg1 = getForegroundInfo()
       if fg1.hwnd != plan.expectHwnd: → clipboard + toast; STOP                       (strict equality, S5)
       decision = decidePaste({ foreground: fg1, ownHwndEquals:false, ... })           // final own-window gate retained
       execute decision keystroke                                                       (Quantum Leap inline path)
  else:
    decision = decidePaste({ foreground: fg0, ownHwndEquals:false, ... })              // unchanged path
    execute decision keystroke
```

- Kill-switch/mute hard-checked in `decidePaste` (`muted → block`, #19). Toast/preview uses `showInactive` only, **after** the paste attempt resolves.

---

## 5. Packaging, config, UI

### 5.1 `package.json` electron-builder (modified — Wave 2/4)

- `resources/bin/` (already an `extraResources` root) gains `whisper-cli.exe`, `whisper-server.exe`, their runtime DLLs, `ggml-tiny.en.bin`, and the 3-entry `models.sha256`. No asar concern — `extraResources` copies to `resources/bin`, outside the asar (same mechanism as `ffmpeg.exe`).
- `mac`: add `identity: null` (ad-hoc), `target: ["dmg", "zip"]`, `artifactName` without user paths; keep `category`. (Notarization/`hardenedRuntime`/entitlements = M7.)
- Installer-size note (S4): +engine (~20 MB) + tiny.en (77.7 MB) ≈ **+~90 MB** → ~200 MB territory, peer-normal. Balanced/Accurate are **never** bundled (abandonment-grade — B1 #4).

### 5.2 `src/utils/config.ts` + `src/types/ipc.ts` (modified — Wave 1.1)

- `Config += { modelTier: ModelTier }`. Serialized `SPEAKFLOW_MODEL_TIER`. `transcriptionMode` (local/remote) and `model` stay as-is; `modelTier` selects the local weight file, `model` remains the cloud model id.
- `CONFIG_VERSION` **"3" → "4"**; `migrateConfigV4(cwd)` (mirrors `migrateConfigV3`, gated by `SPEAKFLOW_CONFIG_VERSION`): additive/non-destructive; sets `modelTier: "fast"` if absent (safe offline default, never auto-selects a download); preserves `GROQ_API_KEY`, hotkey, mode, model, voice/VAD/correction/allowlist keys. Asserted in G26.
- New IPC payloads: `TierStatusPayload { tier, available, downloading, pct }`, `DiskCheckPayload`, `download-tier`/`cancel-tier-download`/`select-tier` channels (renderer→main), `model-download-progress` (reused), `tier-status` (main→renderer).
- **L5 no-silent-cloud:** switching local→remote is an explicit persisted `transcriptionMode` change (existing `.env` discipline); there is **no runtime auto-fallback** channel. On local hard-block the renderer shows an actionable message with a manual "switch to cloud" action (off by default).

### 5.3 UI (new — Wave 3; each <250 lines, Invariant #16/L13)

- `src-ui/components/TierPicker.svelte` — three tiers, availability, size/RAM, "recommended" badge (Balanced iff spike passed), one-click download trigger. Disabled while pipeline active (S16).
- `src-ui/components/ModelDownload.svelte` — progress bar, cancel, disk-insufficient + offline errors (S4/S17).
- `src-ui/components/FirstRunLocal.svelte` — honest first-run copy: Fast works offline out-of-box; larger tiers are one-click; local accuracy expectations set (trust, not marketing — L13). Reads/writes `daemonStore` + guarded `window.electronAPI`.
- Mic-ownership (#17) and mute (#19) surfaces are **untouched** (C-4/C-5).

---

## 6. CI-runner policy (C-10 / L9 — dedicated section, release-governing)

**This section is normative. It cites Intent C-10 and PRD L9 verbatim in intent and mechanizes them in G24.**

- **macOS runs on `workflow_dispatch` and release tags (`v*`) ONLY.** `on: push` / `on: pull_request` scheduling any `macos-*` runner is **forbidden** (Intent C-10; PRD L9). Verified economics (STORM F4): macOS $0.062/min vs Linux $0.006/min (**~10.3×**); Pro = 3,000 private min/mo ≈ **~290 Mac minutes** ≈ 25–35 package jobs. One on-push loop exhausts the quota in an afternoon (W-9/S14).
- **Windows/Linux gates run freely** (`ci.yml`, free runners) and **must be green before any Mac trigger** (fail-fast-on-Windows-first — L9/S11).
- **Caching mandate (F4):** npm + Electron/electron-builder + models cached on every Mac run — no cold-download tax.
- **Budget:** **1–3 deliberate Mac runs/day max** while private (C-10). Expected total across Wave 4: **1–3 runs** (first validates ad-hoc signature + launch; subsequent only if the launch smoke fails).
- **Mechanization (G24):** a CI grep-gate (`scripts/check-workflows.mjs`) fails the build if any workflow file contains a `macos-*` runner under an `on: push`/`on: pull_request` trigger. PR-review rule: any workflow touching `macos-*` must show `workflow_dispatch`/tags-only.
- **Hygiene (C-9/S18):** artifact review step — no `.env`, no absolute user paths, logs scrubbed of secrets; repo stays private until DOM launch sign-off.

---

## 7. No-Windows-regression discipline (C-6 / L12 / S11)

- Cross-platform work is **additive/branching**; the proven win32 surfaces (`win32-window.ts` foreground read, DirectShow capture, uiohook, nut-js) are **not refactored** this cycle. The yield ladder adds a pre-step to the *existing* inject path; `decidePaste` logic is unchanged.
- The full Quantum Leap matrix (G1–G12: typecheck, 138 unit, 38 UI, Playwright, MCP, G7/G11 smokes) runs on **every PR** via `ci.yml` (free runners). M6 adds G13–G26. Windows green is a merge precondition (G25).

---

## 8. Gate matrix — extends Quantum Leap G1–G12 with G13–G26

G1–G12 are inherited unchanged (see `QUANTUM_LEAP_SPEC.md` §8) and remain **blocking** on every PR. M6 adds:

| Gate | Type | Assertion | Command / method | Traces |
|---|---|---|---|---|
| **G13** | **human**+auto | Bundled-local pre-flight: packaged build — engine binary present AND answers a version/health probe; missing → hard-block, **cloud never auto-substitutes** | packaged smoke + `localEngine` probe | M-1, C-7, S1 |
| **G14** | auto | Manifest integrity: every tier hash is 64-hex, no `TODO`, no inline `MODEL_SHA256` in `electron-main.ts` — **release-blocking** | `scripts/check-manifest.mjs` | L4, S3 |
| **G15** | auto | Downloader: SHA-verify on completion, partial-delete, cancel, retry, disk pre-check (2×) | `modelDownloader.test.ts` | L2, S2/S4/S17 |
| **G16** | auto | Tier resolution: bundled→userData order, verify via manifest, mismatch → hard-block | `modelRegistry.test.ts` | C-2, L4 |
| **G17** | auto | Residency lifecycle: idempotent stop, kill-on-quit, idle-unload (mocked child) | `localEngine.test.ts` | #8, L11, S15 |
| **G18** | **human** | **M-3:** window open **and focused** → text lands in prior external target **≥9/10**, **0 into SpeakFlow** | manual smoke (mirror G7) | M-3, L6 (hard floor) |
| **G19** | auto | **M-4:** no `SetForegroundWindow`/`AttachThreadInput` in paste path; inject only `hide()`s own window | CI grep-gate | M-4, L7 (hard floor) |
| **G20** | auto | Yield logic: stale/dead/no-target → toast; own-window final gate retained; strict-equality guard | `yieldFocus.test.ts` + `paste.test.ts` | L6, S5/S6/S8/S9 |
| **G21** | **human** | **M-1:** fresh install, **network disabled**, zero manual steps → speak → paste (Fast tier) | clean VM smoke | M-1 |
| **G22** | **human** | **M-2:** per-tier error count on the fixed 10-utterance script; >Fast measurably lower | `M6_M2_DEV_VOCAB_SCRIPT.md` | M-2 |
| **G23** | **human** | **M-5:** dispatch Mac run → ad-hoc-signed dmg/zip **launches** (Gatekeeper steps) + reaches cloud transcription | `mac-package.yml` + `mac-launch-smoke.md` | M-5, L8/L10 |
| **G24** | auto | CI discipline: no `macos-*` under `on: push`/`pull_request` in any workflow | `scripts/check-workflows.mjs` | C-10, L9, W-9/S14 |
| **G25** | auto | No Windows regression: full G1–G12 green on every PR (free runners) | `ci.yml` | M-6, C-6, S11 |
| **G26** | auto | `migrateConfigV4` preserves prior keys; default `modelTier: "fast"` | `config-migration.test.ts` | L2, upgrade-safety |

**Hard floors (breach blocks the milestone regardless of other progress):** G18 (0 into SpeakFlow), G19 (0 forbidden-API calls). **Release-blocking:** G14, G24.

**Metric → gate coverage (no orphan metrics):** M-1→G21/G13 · M-2→G22 · M-3→G18/G20 · M-4→G19 · M-5→G23 · M-6→G25 · M-7→§10 launch pass.

---

## 9. Honest feasibility re-score (M6 scope)

Quantum Leap shipped at ≈7.6/10. Scoring the M6 delta (bundling + tiers + residency + yield-focus + mac CI proof):

| Criterion | Score /10 | Rationale |
|---|---|---|
| Safety-floor evidence (M-3/M-4) | 9 | Yield only ever *gives away* SpeakFlow focus; strict post-settle equality + retained own-window gate make wrong-window paste structurally unreachable — worst case is the existing clipboard+toast floor; G19 mechanizes M-4 |
| Feasibility within milestone | 7 | Bundling/downloader/SHA reuse existing machinery; tracker piggybacks an existing poll (A-4). Risk concentrates in **two spikes** — resident-engine latency (S1-M6) and mac ad-hoc launch (Wave 4 embedded) — both gated with named fallbacks (Fast-batch default; mac→honest non-goal) |
| Invariant compliance (#13/#15/#17/#18/#19; C-1…C-10) | 9 | #15 closed by the hybrid bundle; #13 extended per-tier + no-unverified-hash release rule (G14); #18 by construction + G19; #17/#19 untouched (C-4/C-5); C-10 mechanized (G24) |
| Testability | 7 | Registry/downloader/tracker/yield/decidePaste are pure and unit-tested; the yield-settle race, resident latency, and Gatekeeper launch are human smokes (G18/G21/G22/G23) — unavoidable OS behavior, mitigated by pure decision layers |
| Economics / maintainability | 8 | Verified CI arithmetic makes W-9 a solved budget (G24); one engine family, three model files, additive services; M7 in-process-ONNX path preserved, not foreclosed |
| Honest-launch readiness (M-7) | 9 | Every claim maps to a gate; falsification pre-commits the downgrades (Fast-only default, clipboard floor, Windows-only v1) |

**Weighted ≈ 8.2 / 10 → passes ≥7.** Realistic outcome: bundled Fast offline + tier ladder + yield-focus paste + mac cloud-launch all land; **resident Balanced-default may degrade to Fast-default/batch** (PRD §3 P2 rule) and **mac local path is the first cut** (PRD §8) — neither breaches a hard floor.

---

## 9b. Adversarial re-review (pre-D1)

**1. Contradiction scan.** No path re-introduces silent cloud (transcribe's `mode` branch is hard-separated; §3.4). No path activates a window (yield is `hide()`-only; §4.4; G19). No path ships an unverified hash (inline constant deleted; G14). No second mic handle (capture untouched; #17). **Consistent.**

**2. Weakest link + STOP trigger.** **Resident-engine latency in packaged Electron at small.en-q5_1** — the one unknown that, if it fails, blocks the Balanced *default* (not the milestone). Isolated as **Wave 1.0 / S1-M6**, proven *first* in a packaged smoke. STOP trigger: S1-M6 fails any pass criterion → halt, escalate; **Fast-default/batch is the known-viable degradation** (ladder still ships opt-in) — the worst realistic outcome does not breach a hard floor. Second-weakest: mac ad-hoc launch (STORM R11 cited-unverified) — isolated to Wave 4's first dispatch run; failure → mac honest non-goal (PRD §3 P4).

**3. Feasibility re-score (5-criteria, post-review).** 48h-equivalent scope is larger than Quantum Leap's; the score holds at **≈8.2** because both tail risks are spike-first with named, floor-preserving fallbacks, and the safety-critical layers (yield/decidePaste/registry) are pure and fully gated before any Electron wiring.

**Weakest link remains testability of OS behavior (7)** — mitigated exactly as Quantum Leap: pure decision layers (G16/G17/G20) carry the logic; human smokes verify only OS behavior (G18/G21/G22/G23).

---

## 10. STOP-gated implementation waves & deferral order

No branch (`feat/m6-public-launch`) is opened until D1 approval; even then **Wave 1.0 runs before any dependent code.** Each wave ends at its gate(s); STOP and report to DOM before the next.

### Wave 1.0 — Residency + bundling spike (human gate **S1-M6**) — FIRST
- **Deliverable:** `docs/DESIGN/M6_LOCAL_RESIDENCY_SPIKE.md` (report only; throwaway probe in a scratch dir, **not** in `src/`).
- **Pass criteria (ALL required):**
  1. `whisper-cli.exe` + `whisper-server.exe` + `ggml-tiny.en.bin` load and transcribe in **dev AND packaged** Electron, **offline** (bundling via `extraResources` proven).
  2. Resident `whisper-server` warm with **`ggml-small.en-q5_1.bin`**: capture-end→text **≤ 800 ms p95** on reference hardware.
  3. `stopEngine` is idempotent; engine is killed on quit (no zombie); idle-unload frees RAM.
  4. All spike logging to **stderr only** (MCP-transport discipline).
- **S1-M6 FAIL → STOP + escalate.** Named fallbacks: (a) tune quantization/threads; (b) **Fast-default + batch spawn**, Balanced/Accurate opt-in with honest latency copy (PRD §3 P2 — known-viable, still ships the ladder); (c) replan. **No silent pivot.**

### Wave 1.1 — Pure services (after S1-M6; unit-tested, no Electron wiring)
- `modelRegistry.ts` (G16), `modelDownloader.ts` pure parts (G15), `localEngine.ts` lifecycle mocked (G17), `foregroundTracker.ts`, `yieldFocus.ts` + `paste.ts` extension (G20), `migrateConfigV4` (G26), extended `binaryPath.getVerifiedModelPath`, `models.sha256` (3 real hashes) + `scripts/check-manifest.mjs` (G14).
- **Gates:** G14, G15, G16, G17, G20, G26 (+ G1 typecheck). **Never cut:** engine bundling, per-tier SHA gate, no-silent-cloud.

### Wave 2 — Electron wiring: bundled local + tiers (after Wave 1.1 green)
- `extraResources` engine+tiny.en; delete inline `MODEL_*`; wire registry/downloader/engine into `transcription.ts` + `electron-main.ts`; tier IPC; disk/RAM checks; engine `before-quit await`.
- **Human gate S2:** **G13** pre-flight + **G21** M-1 offline smoke (clean VM) + **G22** M-2 per-tier script. Surgical rule: ≤~200 net new lines in `electron-main.ts` (overflow → `pipeline.ts`).

### Wave 3 — Paste-focus fix (after Wave 2 green)
- `foregroundTracker` piggyback on the 1 s poll; yield-focus ladder inline in inject; `decideYield` wired; **G19 grep-gate**.
- **Human gate S3:** **G18** M-3 smoke (window open **and focused**, ≥9/10, **0 into SpeakFlow**) + **G19** grep + **G20** logic. If the ladder can't hit M-3 → **revert to clipboard+toast floor, block the paste-while-focused claim** (PRD §3 P3, honest README).

### Wave 4 — macOS CI proof (after Wave 3 green; **1–3 deliberate runs**)
- `ci.yml` (win+linux, on push/PR, free) + `mac-package.yml` (dispatch/tags only, cached, ad-hoc dmg/zip) + `scripts/check-workflows.mjs` (G24) + `scripts/mac-launch-smoke.md`.
- **First dispatch run = the embedded ad-hoc-signature spike** (validates STORM R11). **Human gate S4/G23:** launch (Gatekeeper steps) + cloud transcription reached on a Mac. Failure without paid signing → escalate to DOM per PRD §3 P4 (mac → honest non-goal).

### Launch polish — README honesty (M-7) — never cut
- Regenerate the claims table from gate results; "local ✅" only after **G21 passes**; CHANGELOG; repo stays private until DOM launch sign-off (C-9/L15).

### Deferral order (PRD §8 — first to cut) and never-cut
**Cut in order if behind:** ① macOS **local** transcription path (cloud proof satisfies M-5) → ② Accurate tier (ship Fast + Balanced) → ③ engine residency (Fast-default/batch) → ④ tier-picker/first-run polish.
**NEVER cut:** engine bundling (P1), per-tier SHA gate + no-unverified-hash rule (L4), M-3/M-4 hard floors, no-silent-cloud (L5), macOS CI discipline (L9/C-10), README honesty (L15/M-7).

---

## 11. File touch list

### New
| Path | Purpose | Wave | Gate |
|---|---|---|---|
| `src/services/modelRegistry.ts` | tier ladder + bundled→userData resolution + integrity | 1.1 | G16 |
| `src/services/modelDownloader.ts` | per-tier SHA-gated download, disk check, cancel/retry | 1.1/2 | G15 |
| `src/services/localEngine.ts` | resident whisper-server lifecycle (idempotent stop, idle-unload) | 1.1/2 | G17 |
| `src/services/foregroundTracker.ts` | last-external-foreground tracker (piggyback 1 s poll) | 3 | G18 |
| `src/services/yieldFocus.ts` | pure `decideYield` ladder | 3 | G20 |
| `src/services/pipeline.ts` | (only if electron-main overflow >~200 lines) | 2/3 | — |
| `resources/bin/whisper-cli.exe` · `whisper-server.exe` · `*.dll` | bundled engine (`.gitkeep` like ffmpeg; placed at Spec-impl time) | 2 | G13 |
| `resources/bin/ggml-tiny.en.bin` | Fast tier shipped in installer | 2 | G21 |
| `resources/bin/models.sha256` | 3-entry manifest (tiny.en, small.en-q5_1, large-v3-turbo-q5_0) | 1.1 | G14 |
| `scripts/check-manifest.mjs` | release-blocking no-unverified-hash gate | 1.1 | G14 |
| `scripts/check-workflows.mjs` | forbid `macos-*` on push/PR | 4 | G24 |
| `.github/workflows/ci.yml` | win+linux matrix, push/PR, free | 4 | G25 |
| `.github/workflows/mac-package.yml` | dispatch/tags only, cached, ad-hoc artifact | 4 | G23 |
| `scripts/mac-launch-smoke.md` | Gatekeeper launch-smoke script | 4 | G23 |
| `docs/DESIGN/M6_LOCAL_RESIDENCY_SPIKE.md` | Wave 1.0 spike report | 1.0 | S1-M6 |
| `docs/DESIGN/M6_M2_DEV_VOCAB_SCRIPT.md` | M-2 fixed 10-utterance protocol | 1.1 | G22 |
| `src-ui/components/TierPicker.svelte` | tier ladder UI (<250 lines) | 3 | G3 |
| `src-ui/components/ModelDownload.svelte` | download progress/cancel/disk-error | 3 | G3 |
| `src-ui/components/FirstRunLocal.svelte` | honest first-run local copy | 3 | G3 |
| `src/services/__tests__/*` | `modelRegistry`,`modelDownloader`,`localEngine`,`foregroundTracker`,`yieldFocus`,`paste`(ext) | 1.1 | G14–G20 |

### Modified
| Path | Change | Wave |
|---|---|---|
| `src/services/transcription.ts` | local path: `resolveTierModel` pre-flight verify + resident/batch; `tier` param; **never** cloud on local fail | 2 |
| `src/electron-main.ts` | delete `MODEL_*` inline + inline SHA; wire registry/downloader/engine; tier IPC; yield-focus inject; `stopEngine` on `before-quit`/kill-switch | 2/3 |
| `src/utils/binaryPath.ts` | `getVerifiedModelPath(name, searchDirs?)` bundled→userData search | 1.1 |
| `src/utils/config.ts` | `modelTier` field; `migrateConfigV4`; `CONFIG_VERSION`→"4" | 1.1 |
| `src/types/ipc.ts` | tier/download/disk payloads + channels | 1.1 |
| `src/preload.cts` | expose tier IPC methods (guarded) | 3 |
| `package.json` | `extraResources` engine+tiny.en; `mac.identity:null`, `target:[dmg,zip]` | 2/4 |
| `CLAUDE.md` | whisper-cli **bundled** (Invariant #15 closed); tier ladder; no-unverified-hash release rule; remove "hand-place binary" | 2 |
| `README.md` | honesty pass (M-7) — claims regenerated from gates | polish |

### CLAUDE.md edits (Wave 2) — exact intent
- **Dependency Notes / whisper-cli.exe:** replace "Binary placed manually … not auto-downloaded" with "**Bundled** via `extraResources` (`resources/bin/whisper-cli.exe` + `whisper-server.exe`); Fast tier `ggml-tiny.en.bin` shipped in installer; Balanced/Accurate one-click SHA-gated downloads to `userData/models`."
- **Invariants #13/#15:** note per-tier SHA manifest gate and the **no-unverified-hash release rule** (kills `TODO(M2-ship)` class).
- No new numbered invariant is required — M6 operates within #13/#15/#17/#18/#19; the yield-focus rule is an implementation of #18, mechanized by G19.

---

## 12. Gate D1 — STOP

**This is a Spec at implementation altitude. No code, no branch (`feat/m6-public-launch`), no Wave 1.0 spike until DOM approves:**
- the **tier ladder pins** (Fast `ggml-tiny.en.bin` / Balanced `ggml-small.en-q5_1.bin` / Accurate `ggml-large-v3-turbo-q5_0.bin`) and the **spike-decided default** (§0 Q1),
- the **resident-engine lifecycle** (whisper-server, idempotent stop, idle-unload, kill-on-quit) and **Fast-batch fallback** (§0 Q2),
- the **yield-focus ladder + timings** (staleness ≤2 s, settle 120 ms, max 500 ms, strict HWND equality, retained own-window final gate) and the **M-3 protocol** (§0 Q3, §4),
- the **unified manifest + release-blocking no-unverified-hash gate** deleting the inline `MODEL_SHA256` (§0 Q5, G14),
- the **macOS CI shape** (two workflows, dispatch/tags only, caching, ad-hoc dmg/zip, launch-smoke) and the **§6 CI-runner policy citing C-10/L9** (§0 Q4, §6),
- the **disk/RAM checks + cancel/retry** (§0 Q6) and the **M-2 script** (§0 Q7),
- the **extended gate matrix G13–G26** with G18/G19 hard floors and G14/G24 release-blocking (§8),
- the **feasibility re-score (≈8.2) + §9b adversarial re-review** (§9/§9b),
- the **five STOP-gated waves** (1.0 residency/bundling spike → 1.1 pure services → 2 wiring → 3 paste-focus → 4 mac CI), **deferral order**, and **file touch list** (§10–§11).

**On approval → Wave 1.0 (residency + bundling spike, S1-M6) FIRST; S1-M6 FAIL = STOP + human escalation (Fast-default/batch fallback), no Wave 1.1. Until D1 approval: STOP.**

---

## 13. Handoff

**Files produced:** `docs/DESIGN/M6_PUBLIC_LAUNCH_SPEC.md` (this document).
**Gate reached:** ✅ **D1 APPROVED (2026-07-08).** Resolves PRD §9 OQ 1–7; honors L1–L15; carries the C-10/L9 CI policy (§6); extends the gate matrix to G13–G26; sequences five STOP-gated waves.

**D1 sign-off record (verbatim):** all gates approved; resident engine = whisper-server; Fast = batch whisper-cli; no stdin eval in S1 unless S1 fails; no amendments.

**Next operator step — paste to Sonnet 4.5 (BUILD + VALIDATE), a new session at repo root, AFTER DOM signs Gate D1:**

```
You are the implementer for Oracle SpeakFlow milestone M6.
Spec (Gate D1) is approved. Implement per STOP-gated waves. Do not redesign.

READ FROM DISK FIRST:
1. docs/DESIGN/M6_PUBLIC_LAUNCH_SPEC.md   ← approved Spec — your contract (read ALL sections)
2. CLAUDE.md                              ← invariants #1–#19 (law — never violate)
3. docs/DESIGN/M6_PUBLIC_LAUNCH_PRD.md    ← PRD for context (what/why)

RULES:
- Start with Wave 1.0 ONLY — the residency + bundling spike (M6_LOCAL_RESIDENCY_SPIKE.md).
  STOP at gate S1-M6. Do NOT proceed to Wave 1.1 until all four S1-M6 pass criteria are met.
  S1-M6 FAIL → STOP + escalate to DOM; Fast-default/batch is the sanctioned fallback (no silent pivot).
- Each wave ends at its gate(s). STOP and report to DOM before opening the next wave.
- macOS CI = workflow_dispatch/tags ONLY (Intent C-10 / PRD L9). NEVER schedule macos-* on push/PR.
  Windows/Linux gates must be green before any Mac trigger. Cache npm/Electron/models. Budget 1–3 Mac runs/day.
- Hard floors (breach blocks the milestone): G18 (0 pastes into SpeakFlow), G19 (0 SetForegroundWindow/AttachThreadInput).
  Release-blocking: G14 (no unverified hash), G24 (no macos on push/PR).
- Never violate #13/#15/#17/#18/#19. No SetForegroundWindow. No silent cloud fallback (L5).
  Delete the inline MODEL_SHA256 TODO(M2-ship) constant — all tiers verify via models.sha256.
- Report gate results honestly (PASS/FAIL + evidence). Do not paper over failures.
```
```
```
