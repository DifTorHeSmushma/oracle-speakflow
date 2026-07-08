# Build Plan: Oracle SpeakFlow "Pro" Upgrade (Phase 3) - Forensic Edition

## Phase Overview: The PIV Loop Mapping
This plan follows the **Planning → Implementation → Validation** cycle for each milestone, with specific protections against "Native Binary" and "ASAR" rabbit holes.

---

## Milestone 1: The "Pro" Foundation (UI/UX)
**Goal:** Establish the premium look and feel using Tailwind + shadcn.

| ID | Task | Implementation Detail | Validation (PIV) |
|:---|:---|:---|:---|
| **P3-T01** | Tailwind v4 + shadcn-svelte Setup | Install dependencies. **Crucial:** Configure Vite for Tailwind v4 CSS-first approach. Ensure scoped Svelte styles are isolated. | `npm run build:ui` success; zero CSS conflicts; verify Tailwind classes apply in scoped components. |
| **P3-T02** | Shell & Layout Overhaul | Replace `App.svelte` with a shadcn `Card` based layout. Implement "Dark Mode" as default. | Visual check against PRD Design Tokens. |
| **P3-T03** | Real-time Waveform | Integrate `Web Audio API` to show a canvas-based waveform during `RECORDING` state. | Manual test: Waveform reacts to voice input. |

---

## Milestone 2: The "Local Intelligence" (Engine)
**Goal:** Remove cloud dependency and SoX friction using the **Sidecar Pattern**.

| ID | Task | Implementation Detail | Validation (PIV) |
|:---|:---|:---|:---|
| **P3-T04** | Portable Recorder (ffmpeg) | Replace `spawn('sox')` with a bundled, portable `ffmpeg.exe`. Use `asarUnpack` for execution. | `npm test` (recorder.test.ts) passes without SoX installed. |
| **P3-T05** | Whisper Sidecar Integration | Integrate `whisper-cli` as a pre-compiled sidecar. Avoid `npm` native builds. Resolve path via `process.resourcesPath`. | `transcribe.test.ts` passes using `LOCAL` model via sidecar. |
| **P3-T06** | Model Downloader | Build a UI utility to download the `tiny.en` model (75MB) on first run to `userData` directory. | Check `userData/models` for correct file hash. |

---

## Milestone 3: The "Ecosystem Bridge" (MCP)
**Goal:** Connect SpeakFlow to Cursor/Claude with **Headless Support**.

| ID | Task | Implementation Detail | Validation (PIV) |
|:---|:---|:---|:---|
| **P3-T07** | MCP Tool Implementation | Implement `tools/list` and `tools/call` for `get_last_transcript`. Wire it to the main process `transcriptStore`. | `mcp-inspector` can call the tool and receive the correct text. |
| **P3-T08** | MCP Resource Implementation | Implement `resources/list` and `resources/read` for `transcripts://history`. | Verify history list appears in Cursor's MCP context. |
| **P3-T09** | Cross-Process Sync | Ensure the Headless MCP process can read the latest transcript even if it was recorded in a separate GUI instance (using a shared temp file or IPC). | Manual test: Record in UI, retrieve via Headless MCP. |

---

## Milestone 4: Polish & Distribution
**Goal:** Final validation and packaging.

| ID | Task | Implementation Detail | Validation (PIV) |
|:---|:---|:---|:---|
| **P3-T10** | Error-Path Audit | Forensic review of all `Result<T,E>` paths in the new UI. **NFR-04: DEFERRED — see [ADR-0001](ADR-0001-nfr04-keychain-deferral.md).** Plaintext userData accepted at MVP; keychain integration targeted at Milestone 5. | Manual "Chaos Test" (unplug mic, kill sidecar, etc.). |
| **P3-T11** | ASAR-Aware Packaging | Configure `electron-builder.json` with `asarUnpack` for `resources/bin/*`. Ensure path resolution logic works in production. | Install on a "Clean" Windows machine; verify sidecars execute correctly. |
| **P3-T12** | Monetization UI | Add "Buy Me a Coffee" and "GitHub Sponsors" buttons to the Settings panel. | UI check; links work. |

---

## Forensic Validation Gate (The "Archon" Check)
Before any Milestone is marked "Complete," it must pass:
1. **Sidecar Integrity:** All native binaries must be resolvable in both `dev` and `prod` (packaged) environments.
2. **Headless Verification:** `--mcp` flag must not spawn a GUI or block on user interaction.
3. **Type Safety:** `npm run typecheck` returns zero errors.
4. **Regression:** All 24 Phase 1 tests pass.
5. **Invariant Check:** No violation of `CLAUDE.md` rules (especially Invariant #12 & #15).
