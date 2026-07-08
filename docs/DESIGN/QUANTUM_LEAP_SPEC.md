# Quantum Leap — Engineering Spec (Oracle SpeakFlow)

**Date:** 2026-07-07
**Author:** Frontier architect-engineer (Session 2 — Spec only)
**Status:** 🟡 **DRAFT v2 (hardened) — awaiting Human Gate D1 re-presentation.** No implementation code, no branch work until approved.
**Authority (read from disk):**
- Approved PRD: `docs/DESIGN/QUANTUM_LEAP_PRD.md` (v2, Gate C1 passed 2026-07-07)
- STORM: `docs/DESIGN/storm-reports/speakflow-quantum-leap-2026-briefing.md` (incl. AF1–AF5)
- Wargame: `docs/DESIGN/WARGAME-speakflow-quantum-leap.md`
- Repo law: `CLAUDE.md` (invariants #1–#16)
- Brownfield: `src/electron-main.ts`, `src/services/*`, `.agents/ARCHITECT-HANDOFF-paste-pipeline-blocker.md`

**Altitude:** *How.* File paths, module contracts, data schemas, state transitions, gates. Intent lives in the PRD.

> This Spec **resolves PRD Open Questions 1–5** (§0), honors all six **C1 conditions** (§0.1), meets the **best-in-class parity bar** (§0.2), and defines three implementation waves. It **stops at Gate D1.**

---

## Hardening changelog (D1 review → v2)

Applied in response to the Gate-D1 hardening directive (production-grade / best-in-class bar):

- ✅ **A1** — Deleted the renderer `vad-web`/`getUserMedia` contingency (contradicted Q1). Replaced with a single production rule: Wave 1 Step 1 is the ONNX bundling spike with hard pass criteria; failure → **STOP + human escalation**, no silent architecture pivot. (§9, §10)
- ✅ **A2** — Restored the full gate matrix: added `test:integration` (G5) and `build:ui` (G4); renumbered to **G1–G12**, config migration promoted to **G12** with the `voiceMode: "handsFree"` default assertion. No brownfield gate dropped. (§8)
- ✅ **A3** — Locked production default `voiceMode: "handsFree"` for new installs **and** v2→v3 migration; PTT switchable in Settings; first-run UX defined. (§7)
- ✅ **A4** — Silero model integrity: `silero_vad.onnx` ships with a **SHA-256 manifest**; mismatch → hard-BLOCK (Invariant #13 parity), owner `binaryPath.ts` + manifest. (§3.3, §11)
- ✅ **A5** — Call-app allowlist production-safe defaults: `Zoom.exe`, `Teams.exe`, `ms-teams.exe`, `Discord.exe` only; **removed `msedgewebview2.exe`**; poll **1 s** while hands-free armed; user-editable. (§5)
- ✅ **A6** — G11 gains an idle false-trigger metric (<1 per 30 min at default thresholds), stderr counter, no transcript text; tuning target unless >3/10 min. (§8, §3.3)
- ✅ **A7** — Added **"Best-in-class parity bar"** (§0.2) — honest match/beat table + explicit v1 non-matches (editor-native injection, streaming) and the 6th-lens post-ship path.
- ✅ **A8** — HWND capture timing production rule made explicit (speechStart / keydown; mismatch → clipboard+toast) + README one-liner. (§4.5)
- ✅ **A9** — Wave plan rewritten with **STOP gates**: Wave 1.0 is an ONNX-spike-only human gate (S1); S1 FAIL = STOP, no Wave 1.1. Waves gated on S1/S2/S3. (§10)
- ✅ **A10** — `electron-main.ts` surgical rule: Wave 2 edits extract logic to services, no drive-by refactor, **≤~200 net new lines per wave**, overflow → new module. (§10 Wave 2)
- ✅ **A11** — Invariants #17–#19 finalized with exact text; **G2/G10 PR-review checklist** now includes invariant compliance. (§11)
- ✅ **Part B** — Added **§9b Adversarial re-review**: contradiction scan, gate-coverage map, weakest link + STOP trigger, honest post-hardening feasibility re-score.

---

## 0. Resolution of PRD Open Questions

### Q1 — VAD audio path & mic architecture (RESOLVED — single capture owner)

**Decision: one process owns the microphone at all times — the FFmpeg capture in the main process. The renderer never calls `getUserMedia`. Silero VAD runs in the main process via `onnxruntime-node`, consuming FFmpeg's PCM stream — never a second mic handle.**

Rationale (ground truth): the historical recording failure `ffmpeg exit 4294967291` (GAP-B, handoff §4A) was caused by the renderer's `StatusBar` `getUserMedia` contending with FFmpeg's DirectShow capture for the same device. The Gate-B fix already removed renderer mic (procedural waveform only). Re-introducing WebAudio VAD in the renderer (`@ricky0123/vad-web`) would **re-open that exact conflict.** Therefore:

```
Mic device ──(single DirectShow handle)──► FFmpeg (main proc)
   FFmpeg output CHANGED: -f s16le pipe:1  (continuous raw PCM, 16 kHz mono s16le)
        │
        ▼
  capture.ts (main): buffers stdout into exact 512-sample (1024-byte) frames
        │  ├──► vad.ts: s16 → Float32 [-1,1] → Silero v5 ONNX (onnxruntime-node) → speech prob
        │  └──► segment ring-buffer: retains raw s16le for the active speech span
        ▼
  On speech-end (hangover): wrap retained s16le span as a WAV Buffer → existing transcribe()
```

- **Reframing** (the AF2 512-sample rigidity) is done in `capture.ts`, in the main process, on the byte stream — deterministic and unit-testable with synthetic PCM. FFmpeg already emits exactly 16 kHz mono, so no resample is needed, only reframing/byte-alignment.
- **PTT (F8) fallback mode reuses the identical capture stream**, gated by key-down/key-up instead of VAD events. No second code path to the mic.
- **`onnxruntime-node` + `silero_vad.onnx`** are the only new heavy deps. They load in the **main** process (Node context), so the asar/`__dirname` native-binary hazard that blocks `clipboardy`/`nut-js` in the renderer does **not** apply the same way — but the `.onnx` model and the ORT native addon **must** ship via `extraResources` → `app.asar.unpacked` (Invariant #15), same discipline as `ffmpeg.exe`.

### Q2 — Default VAD thresholds & tuning (RESOLVED)

Silero v5 frame = 512 samples @ 16 kHz = **32 ms/frame**. Defaults (tunable from the Voice Settings tab, persisted to config):

| Param | Default | Meaning | PRD/STORM anchor |
|---|---|---|---|
| `positiveSpeechThreshold` | `0.55` | prob ≥ → frame is speech | AF2 |
| `negativeSpeechThreshold` | `0.35` | prob < → frame is silence (hysteresis band) | AF2 |
| `minSpeechFrames` | `8` (~256 ms) | min contiguous speech before a cycle can fire (rejects clicks/breaths) | L13, AF4 |
| `redemptionFrames` (hangover) | `16` (~512 ms) | trailing silence before speech-end fires | L13, AF4 (300–700 ms band) |
| `preSpeechPadFrames` | `5` (~160 ms) | audio retained *before* detected onset (avoids clipped first word) | AF2 |

Tuning UI exposes three user-facing sliders that map to these: **Sensitivity** (both thresholds, inverse), **Min utterance** (`minSpeechFrames`), **End-of-speech delay** (`redemptionFrames`). Raw values are advanced/collapsible. `redemptionFrames` is the tuning knob referenced by the falsification "tune hangover, not remove" (PRD §3).

### Q3 — Guard precision (RESOLVED — HWND + window-class + process)

The paste guard uses **three** facts about the foreground window at inject time, obtained in one native call batch (§4.2):
1. **HWND** — must equal the HWND captured at record start (`nativeHandleEquals`). Mismatch → clipboard+toast (L2).
2. **Process image name** (via `GetWindowThreadProcessId` → `QueryFullProcessImageName`) — drives the **call-app auto-mute allowlist** (L14) and the recoverable-target policy (L15).
3. **Window class** (`GetClassName`) — distinguishes an **integrated terminal** pane from a chat input, selecting the Shift+Insert conditional variant (L10) vs Ctrl+V.

Target classification table lives in `paste.ts` (§4.3). Unknown class/process on the captured target → treat as **non-recoverable** → clipboard+toast, never a blind keystroke (L15).

### Q4 — Kill-switch semantics (RESOLVED at C1, restated for implementation)

**The kill-switch CLOSES the mic device — it terminates the FFmpeg capture process** (`capture.stop()` → `proc.kill()` releases the DirectShow handle). The OS mic indicator goes dark; this is observable and is asserted in G11. **Discard-only is prohibited.** Un-mute re-spawns FFmpeg capture. Same mechanism backs both the manual kill-switch (L11) and the automatic call-app mute (L14).

### Q5 — Latency anchor & upgrade contract (RESOLVED)

- **Latency anchor (G-smoke objective timer):** `t0` = the instant the record cycle *ends* —
  - Hands-free: the frame at which `redemptionFrames` silence expires (speech-end fires).
  - PTT: the `keyup` event.
  `t1` = the instant the paste keystroke returns **or** the clipboard+toast is shown. `t1 − t0` is logged (stderr, no transcript text) and asserted against NFR budgets (<800 ms local / <1.5 s cloud). The separate **speech-end→transcribe-start** metric (<500 ms, PRD §4) is `t0` → `transcribe()` invocation.
- **Upgrade contract:** config store stays `.env`-format in `userData` (brownfield fact — `config.ts`). Add `SPEAKFLOW_CONFIG_VERSION`. A `migrateConfigV3()` step (additive, non-destructive) preserves **GROQ_API_KEY, hotkey, transcriptionMode, model, language, voice-mode settings, and the dictionary file pointer** across install-over-install. The **Personal Dictionary is a separate `dictionary.json`** in `userData` (survives NSIS upgrade because `%APPDATA%` is untouched by the installer). Migration rules in §7.

### 0.1 — C1 conditions honored

| C1 condition | Where satisfied |
|---|---|
| 1. Resolve mic architecture first — single capture path, no renderer `getUserMedia` conflict | §0 Q1, §3 |
| 2. Define L14 call-app auto-mute (process allowlist + mic exclusivity) | §0 Q3, §5 (`mute.ts`) |
| 3. Define G7 (paste) **and** G11 (hands-free) smoke gates | §8 Gate matrix |
| 4. Re-score 48h feasibility post-VAD honestly | §9 |
| 5. Deferral order & never-cut list | §10 |

### 0.2 — Best-in-class parity bar (A7)

Honest assessment of where SpeakFlow v1 must **match or beat** the best paid tools (Wispr Flow, Aqua Voice), and where it deliberately does not compete this cycle. This is the bar the quantum leap exists to clear — not marketing.

| Capability | Best paid (Wispr / Aqua) | **SpeakFlow v1 target** | Verdict |
|---|---|---|---|
| Hands-free capture | Opt-in (double-tap / mode) — AF1 | **Primary mode, no button** | **BEAT** (differentiator) |
| Custom vocabulary | Yes (shared/cloud dictionary) | JSON, import/export, **offline-owned** | **MATCH+** (local sovereignty) |
| Dev-term accuracy | Strong | Deterministic correction + authoritative dictionary (L5/L6) | **MATCH** |
| Paste into IDE chat | Editor-integrated | Keep-focus + HWND/class guard; **≥9/10 or clipboard fallback** | **MATCH** (via fallback floor) |
| Privacy / mute | Varies; often discard-only | **Kill-switch closes the mic device** (OS dot dark) | **BEAT** (must beat discard-only) |
| Local / offline | Partial | **Full local Whisper path**, no network required | **BEAT** |
| Latency (capture-end→visible) | Low | **<800 ms local / <1.5 s cloud** | **MATCH** |
| Licensing | Paid / subscription | **MIT, no lock-in, BYO Groq key** | **BEAT** |

**Explicitly NOT matched in v1 (deliberate, per PRD §7):**
- **Editor-native / UI-Automation injection** — Wispr's deepest IDE integration. SpeakFlow uses OS-sanctioned keep-focus + clipboard fallback instead. This is the **6th-lens post-ship investigation** (STORM Frontier Q): deterministic `ValuePattern.SetValue` / VS Code extension bridge, out of scope for the 48h leap.
- **Real-time streaming transcription** — SpeakFlow batches on speech-end (VAD) / key-up (PTT). Streaming is a post-ship item.
- **Mac / Linux, wake-word, speaker biometrics** — non-goals this cycle.

---

## 1. Scope

**In:** VAD/hands-free engine, paste pipeline v2 (keep-focus + HWND/class allowlist + fallback ladder), deterministic correction engine + optional gated LLM pass, Personal Dictionary, call-app auto-mute + kill-switch (device close), config migration, Voice/Dictionary Settings UI, bundling of Silero + ONNX runtime.

**Out (deferred, per PRD §7 / L-order):** Mac/Linux, wake-word, cloud-lock, editor-native/UIA injection (6th lens), streaming transcription, speaker biometrics, multi-language correction. Deferral *ranking* in §10.

---

## 2. Architecture delta diagram

```
                         ┌─────────────────────────── BEFORE (M5 / current) ───────────────────────────┐
  mic ──DirectShow──► FFmpeg (one-shot WAV on keyup)                renderer StatusBar getUserMedia  ← REMOVED (Gate B)
                          │                                            (caused ffmpeg exit 4294967291)
  keydown/keyup (uiohook) ─► runPipeline() ─► transcribe() ─► clipboard.writeText
                                                              └─► win32-foreground: SetForegroundWindow  ← RIP OUT (L4)
                                                                  via per-paste PowerShell Add-Type      ← latency violation
                                                              └─► nut-js Ctrl+V (blind)

                         ┌─────────────────────────────── AFTER (Quantum Leap) ───────────────────────────┐
  mic ──DirectShow (SINGLE owner)──► FFmpeg continuous -f s16le pipe:1
                                       │
                       ┌───────────────┴─────────────────┐
                       ▼                                  ▼
              capture.ts (512-frame)            segment ring-buffer (raw s16le)
                       │                                  │
                       ▼                                  │
          vad.ts (Silero v5 / ORT-node)                  │
          debounce(minSpeech) + hangover                 │
                       │  speech-start / speech-end        │
     mute.ts ◄─────────┤ (blocks record+paste while muted / call-app active)   L12/L14
   (kill-switch closes │
    FFmpeg device)     ▼
              STATE MACHINE  IDLE→LISTENING→RECORDING→TRANSCRIBING→CORRECTING→INJECTING→(LISTENING|IDLE)
                       │  on speech-end: wrap segment → WAV
                       ▼
              transcribe() ──► correction.ts (deterministic; opt-in LLM gated)
                                        └─► dictionary.ts (authoritative, runs LAST)  L6
                       ▼
              paste.ts (PURE decision): guard(HWND+class+proc) → {Ctrl+V | Shift+Insert | clipboard+toast | block}
                       │   NEVER SetForegroundWindow. Tray stays showInactive only.       L1/L2/L3/L4/L15
                       ▼
              inline inject in electron-main (clipboard + keystroke)  OR  clipboard+toast floor
```

---

## 3. VAD / hands-free engine (PRIMARY mode)

### 3.1 New files
- `src/services/capture.ts` — owns the continuous FFmpeg capture; emits fixed 512-sample frames and maintains the speech-segment ring buffer. Kill-switch/mute closes the device here.
- `src/services/vad.ts` — Silero v5 wrapper over `onnxruntime-node`; pure frame→probability + a small debounce/hangover state machine emitting `speechStart` / `speechEnd(wavBuffer)`.
- `src/types/voice.ts` — `VadConfig`, `VoiceMode = "handsFree" | "ptt"`, event payloads.

### 3.2 `capture.ts` contract
```ts
export type PcmFrame = Float32Array;               // exactly 512 samples, [-1,1]
export type CaptureSession = {
  onFrame: (cb: (f: PcmFrame) => void) => void;    // every 32 ms while open
  takeSegment: (padFrames: number) => Buffer;      // raw s16le → WAV Buffer (speech span + pre-pad)
  stop: () => Promise<void>;                        // CLOSES device (kill-switch/mute) — Invariant #7 idempotent
};
export const startContinuousCapture = (): Result<CaptureSession, RecorderError>;
```
- FFmpeg args change from `-f wav` to `-f s16le pipe:1` (continuous). Byte-accumulator slices exact 1024-byte (512×s16) frames; a partial tail is retained across `data` events.
- s16→Float32: `sample / 32768`.
- Ring buffer holds the last N seconds of s16le so `preSpeechPadFrames` of pre-onset audio is recoverable.
- `stop()` reuses the existing recorder's idempotent-stop discipline (Invariant #7), `intentionalStop` flag to suppress FFmpeg kill-noise.

### 3.3 `vad.ts` contract
```ts
export type VadEvents = { onSpeechStart(cb): void; onSpeechEnd(cb: (wav: Buffer) => void): void; };
export const createVad = (cfg: VadConfig, capture: CaptureSession): Result<VadEvents, VadError>;
```
- Loads `silero_vad.onnx` from `getBinaryPath("silero_vad.onnx")` (extend `binaryPath.ts` to also resolve a `models/` sibling, or place under `resources/bin/`). Missing model → hard-BLOCK (`VadError.modelNotFound`), never silent degradation (Invariant #13).
- **Model integrity (A4 — Invariant #13 parity):** `silero_vad.onnx` ships with a **SHA-256 manifest** (`resources/bin/models.sha256` or a constant beside the local-Whisper hash), verified on load. **Hash mismatch → hard-BLOCK** (`VadError.modelIntegrity`), notify the user, delete/quarantine the file, **no silent fallback** — identical discipline to the local Whisper `MODEL_SHA256` gate in `electron-main.ts`. Owner: `binaryPath.ts` + the manifest file.
- State machine per frame: `SILENCE → (prob≥pos ×minSpeechFrames) → SPEECH → (prob<neg ×redemptionFrames) → emit speechEnd`. Hysteresis via the pos/neg band.
- **Blocks entirely when `mute.ts` reports muted/kill-switch/call-app active** — no frames processed, no events emitted (L12 hard gate).
- Silero RNN hidden-state is threaded per session; reset on `stop()`.
- **Idle false-trigger instrumentation (A6):** `vad.ts` maintains a stderr-only counter of `speechStart` events that fire during a user-idle window (no recent audio energy above a noise floor). Logged as a rate (triggers per 30 min), **no transcript text**. Target <1 per 30 min at default thresholds (PRD §4). This is a **tuning metric**, not a v1 ship-blocker — unless it exceeds **>3 per 10 min**, at which point defaults must be re-tuned before G11 sign-off.

### 3.4 State-machine extension
Add `LISTENING` and `CORRECTING` to `AppState` (`src/types/ipc.ts`):
```
IDLE ──(hands-free armed)──► LISTENING ──(speechStart)──► RECORDING ──(speechEnd)──►
      TRANSCRIBING ──(ok)──► CORRECTING ──► INJECTING ──► LISTENING (loop)
   any error / mute / kill-switch ──► resetToIdle()  (Invariant #12, #6 preserved)
```
- PTT mode: `IDLE → RECORDING (keydown) → … → INJECTING → IDLE` (unchanged shape; no LISTENING).
- **Invariant #6 (no re-entry) and #12 (no bare return from non-IDLE) are preserved:** every VAD-driven exit path calls `resetToIdle()` or returns to `LISTENING` explicitly. Two concurrent cycles are impossible — VAD `speechStart` is ignored unless `state === "LISTENING"`.

---

## 4. Paste pipeline v2

### 4.1 New file
- `src/services/paste.ts` — **pure** decision logic (the unit-testable core, Wargame weakest-link mitigation). No Electron/native imports; takes facts, returns a `PasteDecision`.
- `src/utils/win32-window.ts` — **replaces** `src/utils/win32-foreground.ts`. Removes `SetForegroundWindow`/`activateWindowHandle` and the per-paste `Add-Type` (L4). Provides read-only foreground introspection via a **single persistent PowerShell session** (spawned once, reused) or a compiled one-line query — no `Add-Type` on the hot path.

### 4.2 Foreground introspection (`win32-window.ts`)
```ts
export type ForegroundInfo = { hwnd: string; className: string; processName: string } | null;
export const getForegroundInfo = (): ForegroundInfo;   // one batched native read, no SetForegroundWindow
export const nativeHandleEquals = (hwndDecimal: string, nativeBuffer: Buffer): boolean; // kept as-is
```
- `SetForegroundWindow`, `AttachThreadInput`, `showWindow()`-in-pipeline, and `preparePasteTargetFocus()` are **deleted** from the pipeline. Tray is `showInactive` only (Invariant restated as new #17, §11).
- Latency target for `getForegroundInfo`: <30 ms (persistent PS session or native), vs the current ~200–800 ms `Add-Type` (F5 latency violation).

### 4.3 `paste.ts` decision contract
```ts
export type PasteDecision =
  | { action: "ctrlV" }
  | { action: "shiftInsert" }        // conditional: terminal class + terminalVariant enabled
  | { action: "clipboardToast"; reason: string }
  | { action: "block"; reason: string };

export const decidePaste = (input: {
  capturedHwnd: string | null;
  foreground: ForegroundInfo;
  ownHwndEquals: boolean;            // foreground === SpeakFlow?
  muted: boolean;                    // mute.ts
  terminalVariantEnabled: boolean;   // config (L10, off by default)
  classifier: TargetClassifier;      // process/class → "chat" | "terminal" | "unknown"
}): PasteDecision;
```
Decision ladder (evaluated top-down):
1. `muted` → `block` (L12 — **zero pastes while muted, hard gate**).
2. `capturedHwnd == null` OR `ownHwndEquals` OR `foreground.hwnd != capturedHwnd` → `clipboardToast` (L2/L3).
3. classify(target): `unknown` → `clipboardToast` (L15 recoverable-only); `terminal` + `terminalVariantEnabled` → `shiftInsert` (L10); `chat` → `ctrlV`.
4. (In `electron-main`) if the chosen keystroke throws or is a suspected no-op (nut-js #347) → fall to `clipboardToast` (Wargame S14). No injector retry (CLAUDE "What NOT to do").

`decidePaste` is 100% unit-testable; only the final keystroke needs human G7.

### 4.4 Electron wiring (inline, per CLAUDE Architecture note)
Paste stays **inline in `electron-main.ts`** (cannot route through `injector.ts` in packaged Electron). `runPipeline()` calls `decidePaste(...)`, then executes: `clipboard.writeText` → `decision.action` keystroke via nut-js, or shows toast + surfaces transcript in preview (`showInactive`). `capturePasteTargetOnKeyUp()` is generalized to `captureTargetHwnd()` (called at PTT keyup **and** at VAD `speechStart`).

### 4.5 HWND capture timing — production UX rule (A8)

The paste target HWND is captured at the **start** of the record cycle, not at inject time, because the user is looking at (and focused on) their target the moment they begin speaking:

- **Hands-free:** capture at **`speechStart`** (VAD onset). This is the frame the user began dictating into their focused chat.
- **PTT:** capture at **`keydown`** (record start), consistent with the above. *(This changes the brownfield behavior, which captured at keyup; keydown is the moment focus is trustworthy.)*
- **At inject time:** re-read `getForegroundInfo()`. If `foreground.hwnd !== capturedHwnd` (user alt-tabbed away mid-utterance, or SpeakFlow itself gained focus) → **clipboard+toast, never the wrong window** (L2/L15). The transcript is preserved and one Ctrl+V recovers it.
- **This is a safety property, not a bug.** README one-liner (Wave 3): *"Stay in your target window while speaking; if you alt-tab mid-utterance, SpeakFlow copies the text to your clipboard instead of pasting into the wrong app — just press Ctrl+V where you want it."*

---

## 5. Auto-mute, kill-switch & mic exclusivity (L11/L12/L14)

### 5.1 New file
- `src/services/mute.ts` — single source of truth for "may we listen/record/paste right now?"

```ts
export type MuteState = { muted: boolean; reason: "user" | "callApp" | "micBusy" | null };
export const getMuteState = (): MuteState;
export const setUserMute = (on: boolean): void;                 // kill-switch (L11) → capture.stop()/restart
export const onMuteChange = (cb: (s: MuteState) => void): void; // drives ListeningIndicator + VAD gate
```
- **Kill-switch (L11):** user hotkey + tray toggle → `setUserMute(true)` → `capture.stop()` (closes FFmpeg → mic device released → OS indicator dark). Un-mute re-spawns capture.
- **Call-app auto-mute (L14 — A5 production-safe defaults):** poll (**1 s while hands-free armed**) the running/foreground process set against a **default allowlist of exactly four**: `Zoom.exe`, `Teams.exe`, `ms-teams.exe`, `Discord.exe`. If present → `muted: "callApp"` → close device. **`msedgewebview2.exe` is deliberately NOT a default** — it hosts ordinary Edge/WebView2 content and would false-mute normal browsing (over-broad). Users who rely on Google Meet can add it in Settings; the Spec documents this false-positive tradeoff at the point of editing. Allowlist is fully user-editable and persisted to config.
- **Mic exclusivity (L14):** if `startContinuousCapture()` fails because another process holds the device (DirectShow busy), classify as `micBusy` → muted, surface state, retry on next poll. Silero cannot distinguish user vs call audio (AF3), so closing the device is the only safe response.
- VAD (`vad.ts`) and `decidePaste` both hard-check `getMuteState().muted` (L12).

---

## 6. Correction engine + Personal Dictionary

### 6.1 New files
- `src/services/correction.ts` — deterministic-first correction. Pure, offline, no model by default.
- `src/services/dictionary.ts` — Personal Dictionary CRUD, schema-validate, import/export, last-good backup.

### 6.2 Correction pipeline order (deterministic-first; dictionary LAST/authoritative — L5/L6, F4)
```
raw Whisper text
  1. whitespace/punctuation normalization      (deterministic)
  2. dev-term casing map                        (deterministic: npm, TypeScript, async, API, JSON, CLI, HWND…)
  3. [opt-in] LLM correction pass               (off by default; "rewrite don't invent"; latency-gated <200ms p95;
                                                  MUST NOT alter protected tokens)
  4. Personal Dictionary replace                (AUTHORITATIVE, runs LAST) ── L6, Wargame S8
```
- Steps 1–2 default; budget **<50 ms p95** (PRD §4). Step 3 opt-in only, latency-gated; if it exceeds budget or regresses clean speech → auto-disable (falsification PRD §3).
- **Protected tokens:** every dictionary `written` form is protected — step 3 is forbidden from touching them; step 4 is authoritative and cannot be overridden.

```ts
export type CorrectionConfig = { llmEnabled: boolean; llmLatencyBudgetMs: number };
export const correct = (raw: string, dict: Dictionary, cfg: CorrectionConfig): Promise<{ text: string; ms: number }>;
```
Wired in `electron-main.runPipeline()` between `transcribe()` and `decidePaste()` (new `CORRECTING` state).

### 6.3 Personal Dictionary schema (`dictionary.json` in `userData`)
```jsonc
{
  "version": 1,
  "entries": [
    {
      "id": "uuid-v4",
      "spoken": "type script",      // matched (case-insensitive, word-boundary) against corrected text
      "written": "TypeScript",       // replacement; becomes a protected token
      "matchMode": "phrase",         // "phrase" | "word"
      "enabled": true
    }
  ]
}
```
```ts
export type Dictionary = { version: number; entries: DictEntry[] };
export const loadDictionary = (dir: string): Result<Dictionary, DictError>;   // schema-validate; on invalid → keep last-good + toast (S15)
export const saveDictionary = (dir: string, d: Dictionary): Result<void, DictError>; // writes .bak of last-good first
export const applyDictionary = (text: string, d: Dictionary): { text: string; protectedTokens: string[] };
export const importDictionary / exportDictionary;                              // versionable JSON artifact (L6)
```
- Invalid hand-edited JSON → **reject, keep last-good, toast** (Wargame S15). Export-before-overwrite.
- Quick-add hook: when a token repeats 3× across a session (Wargame S7), surface "add to dictionary?" (UI, Wave 3).

---

## 7. Config migration / upgrade-over-install

- Store remains **`.env`-format** in `userData` (brownfield: `config.ts`). Extend `Config`:
  ```ts
  Config += {
    voiceMode: "handsFree" | "ptt";
    vad: VadConfig;                 // thresholds §0 Q2
    correction: CorrectionConfig;
    callAppAllowlist: string[];
    terminalVariantEnabled: boolean;
  }
  ```
  Serialized as `SPEAKFLOW_VOICE_MODE`, `SPEAKFLOW_VAD` (JSON), `SPEAKFLOW_CORRECTION` (JSON), etc. Dictionary lives in its own `dictionary.json`.
- `migrateConfigV3(dir)` in `config.ts` (mirrors existing `migrateHotkeyConfigV2` pattern, gated by `SPEAKFLOW_CONFIG_VERSION`):
  - **Additive & non-destructive.** Preserves `GROQ_API_KEY`, `SPEAKFLOW_HOTKEY*`, `SPEAKFLOW_MODEL`, `SPEAKFLOW_LANGUAGE`, `SPEAKFLOW_TRANSCRIPTION_MODE`.
  - Missing voice keys → written with §0 Q2 defaults. Stamps `SPEAKFLOW_CONFIG_VERSION`.
  - Never deletes unknown keys (forward-compat). `dictionary.json` untouched by migration.
- **Production default (A3 — PRD L8): `voiceMode: "handsFree"` on BOTH new installs AND v2→v3 migration.** Hands-free is the primary mode; the migration writes `SPEAKFLOW_VOICE_MODE=handsFree` if absent. This is asserted in **G12**. PTT remains available as an alternate the user selects in the Voice Settings tab (it is never the default and is never auto-selected by migration).
- **First-run UX (A3):** on first launch after install/upgrade, the **ListeningIndicator is visible** (mirrors the OS mic dot per AF5), and a **one-time explainer** surfaces the kill-switch (hotkey + tray toggle) and states the local-only guarantee. Dismissed-once flag persisted in config; never shown again unless reset.
- NSIS upgrade: `%APPDATA%/oracle-speakflow` is not wiped by the installer → key/hotkey/dictionary/voice settings survive (Wargame S12). No destructive overwrite.

---

## 8. Gate matrix G1–G12 (A2 — no brownfield regressions)

Every gate is **blocking** except the single idle-false-trigger metric inside G11, which is observational (tuning target unless it exceeds >3/10 min — then blocking).

| Gate | Type | Assertion | Command / method |
|---|---|---|---|
| **G1** | auto | Typecheck — 0 errors | `npm run typecheck` |
| **G2** | auto | Unit tests green (Phase-1 regression + new service tests) | `npm test` |
| **G3** | auto | UI component tests green (+ new Voice/Dictionary/Listening components) | `npm run test:ui` |
| **G4** | auto | Build clean (also `node --check dist/**/*.js`) | `npm run build && npm run build:ui` |
| **G5** | auto | Integration harness green (Playwright/Electron) | `npm run test:integration` |
| **G6** | auto | MCP spawn 5/5, no stdout pollution | `node scripts/test-mcp-spawn.mjs` |
| **G7** | **human** | Paste **≥9/10** into Cursor chat, consecutive, **0 wrong-target** | manual smoke |
| **G8** | auto | Correction deterministic + dictionary-last authoritative + **<50 ms p95** | `correction.test.ts` |
| **G9** | auto | Dictionary CRUD / import / export / schema-validate / last-good backup | `dictionary.test.ts` |
| **G10** | auto | `decidePaste` ladder: muted→block, guard-mismatch→toast, **0 wrong-target** in logic | `paste.test.ts` |
| **G11** | **human** | Hands-free **≥8/10** no hotkey; **0 paste while muted/kill-switch**; speech-end→transcribe **<500 ms**; **OS mic dot dark on kill-switch**; **idle false-trigger <1/30 min** (observational — stderr counter, no transcript text; blocking only if >3/10 min) | manual smoke |
| **G12** | auto | `migrateConfigV3` preserves key/hotkey/dictionary/voice; **default `voiceMode: "handsFree"`** | `config-migration.test.ts` |

**Gate renumbering note (A2):** vs the draft-v1 matrix, `test:integration` is restored as **G5**, MCP moves to **G6**, and config-migration is promoted from G6 → **G12** (now also asserting the hands-free default). No brownfield gate was dropped. Downstream §-references (waves, file touch list) use this numbering.

Additional non-gating instrumentation: latency anchor `t1−t0` logged to stderr (no transcript text), asserted against <800 ms local / <1.5 s cloud during G7/G11 observation.

---

## 9. Honest 48h feasibility re-score (post-VAD) — C1 condition 4

Wargame scored the **paste-only** strategy 8.4/10. Re-scoring the **full VAD + paste v2 + correction + dictionary** scope:

| Criterion | Paste-only (Wargame) | **Post-VAD (honest)** | Why it moved |
|---|---|---|---|
| Paste reliability evidence | 9 | 9 | root cause unchanged; keep-focus + guard still verified |
| 48h feasibility | 8 | **5** | new native deps (`onnxruntime-node` + Silero model), continuous-capture refactor of `recorder.ts`, reframing, main-proc ONNX, auto-mute polling, threshold tuning UI — substantial |
| Invariant compliance | 9 | 8 | new single-mic-owner + no-focus-steal invariants added; bundling discipline extends to ONNX |
| Testability | 7 | 6 | VAD is non-deterministic to unit test; mitigated by testing reframing + decision state machine with synthetic frames/probabilities |
| OSS maintainability | 8 | 7 | more services, but each is self-contained and deterministic-first |

**Honest weighted ≈ 7.0/10 — passes the ≥7 gate, but barely, and only because the PRD degradation rule is the safety valve.** Realistic 48h outcome: **VAD trigger + paste v2 + deterministic correction + dictionary all land; auto-paste-in-hands-free may degrade to VAD + clipboard+toast** (PRD §3 locked degradation rule — silence must not degrade to button-only; paste may degrade to clipboard). LLM correction, Shift+Insert, installer polish are the cut candidates (§10), **not** VAD.

**Load-bearing risk:** `onnxruntime-node` bundling in packaged Electron (asar/unpacked native addon). **Mitigation (A1 — single production rule, no renderer fallback):** prove it in **Wave 1.0 — the ONNX bundling spike (human gate S1)** before any other Wave 1 work. **There is NO fall-back to `@ricky0123/vad-web`/renderer `getUserMedia`** — that would violate Invariant #17 (single mic owner) and re-open the GAP-B FFmpeg contention. If S1 fails, **STOP and escalate to human** with three options — (a) a different ORT packaging path, (b) an **energy-gate VAD on the existing FFmpeg PCM stream** (RMS/threshold speech detection, same single-mic-owner architecture, no ONNX), or (c) replan the timeline. **No silent architecture pivot.** See §10 Wave 1.0.

---

## 9b. Adversarial re-review (post-hardening, pre-D1)

### 1. Contradiction scan — Q1 single mic owner vs any remaining fallback
**Result: NONE.** The renderer `vad-web`/`getUserMedia` contingency has been fully removed from §9 (A1). The only sanctioned S1-failure paths are ORT re-packaging, an **energy-gate VAD on the same FFmpeg PCM stream** (which *preserves* Invariant #17 — still a single mic owner, no renderer mic), or human replan. No path re-introduces a second mic handle. `capture.ts` is the sole `getUserMedia`-free capture, and Invariant #17 forbids renderer mic outright. **Consistent.**

### 2. Gate coverage scan — every PRD §4 metric → a gate or log
| PRD §4 metric | Target | Covered by |
|---|---|---|
| Paste reliability (consecutive) | ≥9/10 | **G7** (human) |
| Latency capture-end→visible (local) | <800 ms | **G7/G11** stderr `t1−t0` (§0 Q5, §8) |
| Latency capture-end→visible (cloud) | <1.5 s | **G7/G11** stderr `t1−t0` |
| Correction added latency (deterministic) | <50 ms p95 | **G8** |
| Correction added latency (LLM opt-in) | <200 ms p95 | **G8** (opt-in path, auto-disable on breach) |
| Wrong-target pastes | 0 | **G10** (logic) + **G7** (human) |
| Dictionary adoption (add→applied offline) | works | **G9** |
| Offline usability (full path, no network) | works | **G8/G9** + G11 local-mode smoke |
| Hands-free cycle (consecutive, no hotkey) | ≥8/10 | **G11** (human) |
| False-positive paste during mute/kill-switch | 0 (hard) | **G10** (block logic) + **G11** (human) |
| Speech-end→transcribe-start | <500 ms | **G11** (measured, §0 Q5) |
| Unintended trigger during idle | <1/30 min | **G11** idle counter (observational, stderr) |
**Every §4 metric maps to a gate or an explicit log. No orphan metrics.**

### 3. Weakest link (post-hardening) + STOP trigger
**Weakest link: `onnxruntime-node` clean bundling in packaged Electron (asar-unpacked native addon + `.onnx` model resolution).** It is the single dependency that, if it fails to load in a *packaged* build, blocks the entire hands-free P0.
- **Mitigation:** isolated as **Wave 1.0 / gate S1** — it is proven *first, in a packaged smoke,* before any dependent service code is written. Second-weakest (real-paste testability) is mitigated by making `decidePaste` 100% pure (G10) so only the final keystroke needs human G7.
- **STOP trigger:** S1 fails any of its four pass criteria → halt, escalate, human chooses (a)/(b)/(c). The energy-gate VAD (b) is a *known-viable* degradation that still ships hands-free on the same architecture — so even the worst realistic S1 outcome does **not** force button-only (honors the PRD locked degradation rule).

### 4. Honest feasibility re-score (post-hardening) — same 5 criteria as §9
| Criterion | §9 (pre-hardening) | **Post-hardening** | Why |
|---|---|---|---|
| Paste reliability evidence | 9 | 9 | unchanged; root cause verified |
| 48h feasibility | 5 | **6** | S1 spike gate de-risks the biggest unknown up front and gives a known-viable energy-gate fallback → less tail risk, though scope is unchanged |
| Invariant compliance | 8 | **9** | #17–#19 finalized with exact text + PR-review checklist (A11); allowlist tightened (A5); no contradictions (9b.1) |
| Testability | 6 | **7** | G1–G12 restored (integration G5 back); idle counter + latency anchors give objective evidence for previously subjective smokes |
| OSS maintainability | 7 | **7** | electron-main surgical rule (A10) caps complexity growth; otherwise unchanged |

**Post-hardening weighted ≈ 7.6/10** (was ≈7.0). The hardening did not inflate the score by adding scope — it *raised confidence* on feasibility (spike-first + fallback), invariant compliance (finalized + checklisted), and testability (full matrix + objective logs). The honest 48h expectation is unchanged: **VAD + paste v2 + deterministic correction + dictionary land; auto-paste may degrade to VAD + clipboard+toast; button-only is never the fallback.**

---

## 10. Implementation waves & deferral order

Each wave is a **STOP gate**. A wave does not begin until the prior gate is green. No branch (`feat/quantum-leap-v1`) is opened until D1 approval; even then, **Wave 1.0 runs before any dependent code.**

### Wave 1.0 — ONNX SPIKE ONLY (human gate S1) — A1/A9
- **Deliverable:** `docs/DESIGN/QUANTUM_LEAP_SPIKE_S1.md` (spike report only — minimal throwaway probe code permitted in a scratch dir, not in `src/`).
- **Pass criteria (ALL required):**
  1. `silero_vad.onnx` loads via `onnxruntime-node` in **dev AND packaged** Electron.
  2. Inference on a synthetic 512-frame input: **<5 ms p95** on the target machine.
  3. Renderer never opens the mic — **no `getUserMedia`** anywhere (Invariant #17).
  4. All spike logging to **stderr only** (MCP-transport discipline / Invariant clean).
- **S1 FAIL → STOP. Escalate human.** Options: (a) different ORT packaging, (b) energy-gate VAD on the existing FFmpeg PCM stream (same single-mic-owner architecture, no ONNX), (c) replan timeline. **No Wave 1.1. No silent architecture pivot.** Human decides.

### Wave 1.1 — Pure services (ONLY after S1 pass; fully unit-tested, no Electron wiring)
1. `capture.ts` reframing + `vad.ts` decision state machine (tested with synthetic PCM/probabilities).
2. `correction.ts` deterministic engine → **G8**.
3. `dictionary.ts` (schema, CRUD, import/export, validate, last-good backup) → **G9**.
4. `paste.ts` `decidePaste` ladder (pure) → **G10**.
5. `mute.ts` state logic (allowlist match, exclusivity) — unit-tested.
6. `migrateConfigV3` → **G12**.
- **Gates for Wave 1.1: G8, G9, G10, G12** (plus G1 typecheck).
- **Never cut:** VAD engine, deterministic correction, dictionary.

### Wave 2 — Electron wiring (ONLY after G1–G6 + G8–G10 + G12 green)
7. Refactor `recorder.ts` → continuous `capture.ts` (s16le stream); PTT reuses it.
8. Wire `vad.ts` → state machine (`LISTENING`/`CORRECTING`); wire correction+dictionary into `runPipeline()`.
9. Replace `win32-foreground.ts` → `win32-window.ts`; **remove `SetForegroundWindow`/`Add-Type`**; wire `decidePaste` inline → **G7 prep**.
10. Kill-switch (device close) + call-app auto-mute polling (1 s) → **G11 prep**.
11. State-machine hardening pass (Invariants #6/#12/#18/#19 on all new paths).
- **`electron-main.ts` surgical rule (A10):** Wave 2 edits are **surgical — logic is extracted into the services above** (`capture`/`vad`/`paste`/`mute`/`correction`), and `electron-main.ts` only *wires* them. **No drive-by refactor.** Net new lines in `electron-main.ts` **≤ ~200 per wave**; any overflow → a new module (e.g. `src/services/pipeline.ts`). This keeps the file reviewable and honors Invariant #16 (composition over massive files).
- **Human gate S2:** integration harness (G5) + paste-logic tests (G10) green before Wave 3.

### Wave 3 — UI + bundling
12. `src-ui/components/VoiceSettings.svelte`, `DictionaryPanel.svelte`, `ListeningIndicator.svelte` (each <250 lines, Invariant #16) + IPC in `preload.cts` / `ipc.ts` → **G3**.
13. Bundle `silero_vad.onnx` (+ SHA-256 manifest, A4) + ORT-node via `extraResources`/`app.asar.unpacked` (Invariant #15); upgrade-over-install verification.
14. README/CHANGELOG/screenshots; full **G1–G12** sweep.
- **Human gate S3:** **G7 + G11** smoke pass.

### Deferral ranking (AMENDED C1 — first cut → last) and NEVER-cut
**Cut in this order if behind:** ① NSIS installer polish → ② Shift+Insert terminal variant → ③ LLM opt-in correction → ④ cloud latency optimizations.
**NEVER cut:** VAD/hands-free (P0), paste v2, Personal Dictionary, deterministic correction.
**Degradation rule (locked):** if VAD + auto-paste can't both land in 48h → ship **VAD + clipboard+toast**. Silence must **never** degrade to button-only; paste may degrade to clipboard.

---

## 11. File touch list

### New
| Path | Purpose | Wave | Gate |
|---|---|---|---|
| `src/services/capture.ts` | continuous FFmpeg s16le capture, 512-frame reframing, device close | 1/2 | — |
| `src/services/vad.ts` | Silero v5 ONNX wrapper + debounce/hangover | 1 | G11 |
| `src/services/correction.ts` | deterministic (+opt-in LLM) correction | 1 | G8 |
| `src/services/dictionary.ts` | Personal Dictionary CRUD/validate/import-export | 1 | G9 |
| `src/services/paste.ts` | pure `decidePaste` ladder | 1 | G10 |
| `src/services/mute.ts` | mute/kill-switch/auto-mute state | 1/2 | G11 |
| `src/utils/win32-window.ts` | read-only foreground introspection (replaces `win32-foreground.ts`) | 2 | G7 |
| `src/types/voice.ts` | `VadConfig`, `VoiceMode`, `Dictionary`, `CorrectionConfig` types | 1 | — |
| `resources/bin/silero_vad.onnx` (or `resources/models/`) | bundled VAD model (`.gitkeep` placeholder like ffmpeg) | 3 | — |
| `resources/bin/models.sha256` | SHA-256 manifest for `silero_vad.onnx` (A4, Invariant #13 parity) | 1/3 | G11 |
| `docs/DESIGN/QUANTUM_LEAP_SPIKE_S1.md` | ONNX bundling spike report (A1/A9 — gate S1) | 1.0 | S1 |
| `src-ui/components/VoiceSettings.svelte` | thresholds, hands-free/PTT toggle, kill-switch, first-run explainer | 3 | G3 |
| `src-ui/components/DictionaryPanel.svelte` | dictionary UI + import/export | 3 | G3 |
| `src-ui/components/ListeningIndicator.svelte` | mirrors OS mic dot + mute state | 3 | G3 |
| `src/services/__tests__` / `tests/*.test.ts` | `vad`, `correction`, `dictionary`, `paste`, `mute`, `config-migration` | 1.1 | G8/G9/G10/G12 |

### Modified
| Path | Change | Wave |
|---|---|---|
| `src/electron-main.ts` | wire VAD→state machine (`LISTENING`/`CORRECTING`); inline `decidePaste`; remove `preparePasteTargetFocus`/`activateWindowHandle`; add mute/kill-switch/correction/dictionary IPC; generalize `capturePasteTargetOnKeyUp`→`captureTargetHwnd` | 2 |
| `src/services/recorder.ts` | refactor to continuous `-f s16le pipe:1`; PTT reuses capture (or thin wrapper) | 2 |
| `src/utils/config.ts` | `migrateConfigV3`; new voice/correction/allowlist fields | 1 |
| `src/utils/binaryPath.ts` | resolve `silero_vad.onnx` / ORT-node model path | 1 |
| `src/types/ipc.ts` | `AppState += "LISTENING" \| "CORRECTING"`; new payloads (voice-mode, mute, dictionary CRUD, correction toggle) | 1 |
| `src/preload.cts` | expose new IPC methods (guarded) | 3 |
| `src/services/transcription.ts` | *(no change to transcribe; correction is a separate stage wired in electron-main)* | — |
| `CLAUDE.md` | add invariants #17–#19 (§ below); note continuous-capture recorder | 2 |
| `src/utils/win32-foreground.ts` | **delete** after `win32-window.ts` lands (remove `SetForegroundWindow`) | 2 |
| packaging config (electron-builder/forge) | `extraResources` for `silero_vad.onnx` + ORT-node unpacked | 3 |

### New invariants to add to `CLAUDE.md` (Wave 2) — exact text (A11)
- **#17 Single mic owner** — FFmpeg (main process) is the sole microphone consumer. The renderer must never call `getUserMedia`. VAD consumes FFmpeg's PCM stream; it must not open a second device handle.
- **#18 Never steal foreground** — the pipeline must never call `SetForegroundWindow`/`AttachThreadInput`; the tray uses `showInactive` only. Paste lands in the already-focused window or degrades to clipboard+toast.
- **#19 No paste/record while muted** — VAD and `decidePaste` must hard-check `mute.ts`; zero pastes and zero recording while muted or kill-switch active. Kill-switch closes the mic device (indicator dark), never discard-only.

**PR-review checklist (A11) — every Wave 1.1+ PR must confirm, and G2/G10 encode where testable:**
- [ ] No `getUserMedia` in `src-ui/**` (#17) — grep-gate in CI.
- [ ] No `SetForegroundWindow`/`AttachThreadInput`/`Add-Type` in the paste path (#18) — grep-gate + `win32-foreground.ts` deleted.
- [ ] `decidePaste` returns `block` whenever `muted` (#19) — asserted in `paste.test.ts` (**G10**).
- [ ] All new service return types are `Result<T,E>`; no throws across service boundaries (Invariant #2) — covered by unit tests (**G2**).
- [ ] `electron-main.ts` net new lines ≤ ~200 this wave (A10).
- [ ] No `console.log`/`process.stdout` added to any code reachable in `--mcp` mode (Invariant, **G6**).

---

## 12. Gate D1 — STOP

**This is a Spec at implementation altitude. No code, no branch (`feat/quantum-leap-v1`), no Wave 1.0 spike until the maintainer approves:**
- the **mic architecture resolution** (§0 Q1 — single FFmpeg owner, main-proc Silero, no renderer `getUserMedia`) and the **A1 no-renderer-fallback rule** (§9),
- the **five Open-Question resolutions** (§0) and the **best-in-class parity bar** (§0.2),
- the **paste v2 decision ladder**, removal of `SetForegroundWindow`, and **HWND-capture-at-speechStart/keydown** rule (§4),
- the **correction order + dictionary schema** (§6),
- the **full Gate matrix G1–G12 incl. G7/G11 human smokes and G12 hands-free default** (§8),
- the **honest post-hardening re-score (≈7.6/10) and §9b adversarial re-review** (§9/§9b),
- the **STOP-gated wave plan (Wave 1.0 spike S1 → 1.1 → S2 → S3), electron-main surgical rule, deferral ranking, and file touch list** (§10–§11),
- the **three new invariants #17–#19 and the PR-review checklist** (§11).

**On approval → Wave 1.0 (ONNX bundling spike S1) FIRST; S1 FAIL = STOP + human escalation, no Wave 1.1. Until D1 approval: STOP.**
