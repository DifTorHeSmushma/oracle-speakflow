# Wargame — SpeakFlow Quantum Leap (Adversarial Pre-Mortem)

**Date:** 2026-07-07
**Inputs:** `storm-reports/speakflow-quantum-leap-2026-briefing.md`, repo code (`electron-main.ts`, `win32-foreground.ts`, `transcription.ts`), `CLAUDE.md` invariants.
**Purpose:** Stress-test every major decision against failure before writing the PRD. Gate: adversarial score ≥7/10.

---

## B1 — Competing approach matrix

Evaluated on **paste reliability**, **48h feasibility**, **OSS cost**, **privacy**.

| # | Approach | Example impl | Win condition | Lose condition | Verdict |
|---|---|---|---|---|---|
| 1 | Clipboard + Ctrl+V **while stealing foreground** (CURRENT) | nut-js + `SetForegroundWindow` | — | Background process can't win foreground (verified MS docs); PowerShell `Add-Type` per paste = 200–800ms; racy | **REJECT** — this is the current bug |
| 2 | Clipboard + Ctrl+V **without focus steal** (keep target foreground) + HWND guard | Electron `clipboard` + nut-js Ctrl+V; capture HWND at keyup only to *verify*, never activate | Target app never loses foreground during background pipeline → Ctrl+V lands correctly; ≥9/10 | User alt-tabs away mid-pipeline (rare); some apps reject synthetic Ctrl+V | **PRIMARY** |
| 3 | Clipboard-only + toast "press Ctrl+V" | Electron clipboard + notification | 100% reliable delivery of text to clipboard; zero focus risk | One manual keystroke per dictation (friction) | **FALLBACK** (guaranteed floor) |
| 4 | Shift+Insert variant of #2 | nut-js `Shift+Insert` | Works where Ctrl+V is intercepted (IDE **terminals**, verified Wispr behavior) | Not needed for standard chat inputs; some apps map it differently | **CONDITIONAL** (terminal targets) |
| 5 | UI Automation `ValuePattern.SetValue` into focused control | PowerShell UIA / node-uia | Deterministic, focus-independent set of edit control | Chromium/Cursor custom controls may not expose ValuePattern; per-app fragility; heavy | REJECT for 48h (6th-lens, post-ship) |
| 6 | HWND `SetForegroundWindow` + `AttachThreadInput` hack | current spike + Chen's hack | Occasionally forces focus | Chen: 2nd `SetForegroundWindow` hangs; couples message pumps; unreliable | **REJECT** |
| 7 | Named-pipe / editor extension bridge to Cursor | hypothetical VS Code ext | Fully deterministic injection | New surface per editor; days of work; out of scope | REJECT for 48h |
| 8 | MCP-only (agent pulls transcript, no auto-paste) | MCP resource | Zero paste risk; agent-native | Not a dictation UX for the human typing into chat | KEEP as complementary, not primary |

**Decision rule applied — one primary + one fallback with explicit triggers:**
- **PRIMARY = Approach 2** (keep-focus + HWND verify + Ctrl+V). Chosen because it directly removes the verified root cause and the latency violation, and requires no new native deps.
- **FALLBACK = Approach 3** (clipboard-only + toast). **Trigger:** at inject time, foreground HWND ≠ captured target HWND, OR foreground == SpeakFlow, OR Ctrl+V throws. Instead of pasting into the wrong window, write clipboard + toast and surface transcript in preview.
- **CONDITIONAL = Approach 4** (Shift+Insert). **Trigger:** target window class indicates an integrated terminal (deferred to config flag; not P0).
- **COMPLEMENT = Approach 8** (MCP) preserved and extended per target-state.

---

## B2 — Red-team scenario table (Trigger → Expected failure → Detection → Mitigation → Owner file)

| # | Trigger | Expected failure | Detection | Mitigation | Owner file |
|---|---|---|---|---|---|
| 1 | Cursor chat not foreground at key-up | Paste lands in wrong app / SpeakFlow | `getForegroundWindowHandle()` at inject ≠ captured HWND | Fallback to clipboard-only + toast (Approach 3); do NOT paste | `electron-main.ts`, `win32-foreground.ts` |
| 2 | SpeakFlow tray steals focus post-paste | Next F8 captures SpeakFlow as target | Preview uses `showInactive` only; `showWindow`/`focus()` never called during pipeline | Enforce no-focus-steal policy; guard `showWindow` out of pipeline path | `electron-main.ts` |
| 3 | `ffmpeg.exe` missing from `resources/bin` | Recording fails (`exit 4294967291`) or silent PATH fallback | Pre-flight existence check on startup (Invariant #15) | Hard-BLOCK with actionable message + bundle via `extraResources`; block paste work until present | `binaryPath.ts`, packaging config |
| 4 | Second F8 while state ≠ IDLE | Re-entry / double pipeline | State machine guard (Invariant #6) | Silently ignore DOWN unless `state==="IDLE"` (already enforced) | `electron-main.ts` |
| 5 | Groq timeout mid-transcribe | Hang / stuck non-IDLE | `networkTimeout` classified by `error.code` | Retry 2× 500ms backoff then `resetToIdle` (Invariant #12) | `transcription.ts`, `electron-main.ts` |
| 6 | Local model SHA mismatch | Wrong/corrupt output silently | SHA gate before use (Invariant #13) | Hard-BLOCK + notify; no silent fallback to defaults | `transcription.ts`, `binaryPath.ts` |
| 7 | Unknown word repeated 3× in session | Same misrecognition re-pasted | Track transcript n-grams; surface "add to dictionary?" hint | Personal Dictionary quick-add; deterministic replace next time | correction service, dictionary service |
| 8 | Custom vocab word conflicts with correction pass | Correction overwrites a correct dictionary term | Order: dictionary replace is authoritative, runs LAST; correction cannot touch protected tokens | Protected-token list from dictionary; constrained rewrite only | correction service |
| 9 | VAD false positive during Zoom call | Records/pastes unwanted audio | VAD confidence threshold + privacy kill-switch; PTT remains default | Ship VAD off-by-default; Silero threshold; global mute hotkey | VAD service (deferred) |
| 10 | Electron stale `dist-ui` / zombie process | UI shows old build; port/lock conflicts | Build gate G4; single-instance lock | `app.requestSingleInstanceLock()`; clean build step | `electron-main.ts`, build scripts |
| 11 | MCP stdout pollution | JSON-RPC transport corrupts | Any `console.log` in `--mcp` path | All debug → `process.stderr` via `log()`; grep guard in CI | `electron-main.ts` (runMcpServer) |
| 12 | NSIS upgrade over existing `%APPDATA%` config | Config wiped / schema mismatch | Version field in config; migration on load | Additive schema + migration; never destructive overwrite (see delete-before-overwrite caution) | `config.ts`, installer |
| 13 | Correction LLM pass adds >200ms p95 | NFR-01 latency breach | Instrument key-up→visible timer | LLM correction opt-in + latency-gated; deterministic default | correction service |
| 14 | nut-js Ctrl+V silent no-op (issue #347) | Clipboard set but nothing pastes | No reliable success signal from keystroke | Fallback ladder: on suspected no-op keep clipboard + toast; user re-triggers (no injector retry per CLAUDE) | `electron-main.ts` |
| 15 | Dictionary JSON hand-edited to invalid | Load crash / lost entries | Schema validate on load; backup last-good | Reject invalid with toast, keep last-good; export before overwrite | dictionary service |

---

## B3 — Timeline war-game (48h notional)

| Slice | Deliverable | Human checkpoint | Kill criteria (cut if behind) |
|---|---|---|---|
| **Hour 0–6** | STORM briefing (done) + Wargame (done) + Intent PRD → **Gate C1 approval** | ✅ **C1: PRD approval** | — (research is load-bearing; do not cut) |
| **Hour 6–24** | Engineering spec (Gate D1) + **Wave 1 services**: VAD/hands-free engine (Silero, debounce/hangover, kill-switch), correction engine (deterministic), Personal Dictionary (schema + CRUD + import/export), vocab-aware transcription hook | D1: spec approval | Cut LLM-correction option first; ship deterministic-only. **Do NOT cut VAD.** |
| **Hour 24–40** | **Wave 2**: Paste pipeline v2 (no focus steal + HWND allowlist guard + fallback ladder) wired to VAD trigger + state-machine hardening; **Wave 3 start**: Dictionary + Voice-mode Settings tab | — | Cut Shift+Insert terminal variant; keep Ctrl+V + clipboard-fallback |
| **Hour 40–48** | Bundling (ffmpeg/whisper via `extraResources`, upgrade-over-install), MCP extensions, README/screenshots/CHANGELOG, **G1–G11 smoke** | ✅ **Hour 40: hands-free + paste + dictionary smoke** | Deferral rank (amended): **installer polish > Shift+Insert > LLM correction > cloud opt** |

**Explicit deferral ranking (AMENDED C1 — first to be cut):** NSIS installer polish → Shift+Insert terminal variant → LLM opt-in correction → cloud latency optimizations.
**NEVER cut:** VAD/hands-free (P0, co-equal with paste), paste v2, Personal Dictionary, deterministic correction. If VAD+paste can't both land reliably in 48h, ship **VAD + clipboard-fallback** — silence must not degrade to button-only; paste may degrade to clipboard+toast.

**New Wargame scenarios folded in (VAD sweep):** S16 Silero frame-mismatch (must resample to 16kHz/512-sample frames) → S17 speech from Zoom/other person triggers record → S18 auto-paste fires into wrong/unfocused window → S19 mic-indicator-always-lit trust erosion → S20 EDR/AV flags mic-hold + keystroke injection. Mitigations: strict reframing, target-focus allowlist guard before paste, kill-switch that closes the mic device, auto-mute when another app holds the mic, visible listening state, log nothing. (Owner files assigned in Spec.)

---

## B4 — Adversarial score (independent evaluator persona)

Scoring the chosen **Primary (Approach 2) + Fallback (Approach 3)** strategy:

| Criterion | Score /10 | Rationale |
|---|---|---|
| Paste reliability evidence | 9 | Root cause verified against MS primary docs; fix removes the fought-against API entirely; guard + fallback prevent wrong-target pastes |
| 48h feasibility | 8 | No new native deps; mostly deletion + reordering + a guard; dictionary/correction are self-contained services |
| Invariant compliance (CLAUDE.md) | 9 | Honors #6 re-entry, #12 resetToIdle, #13 SHA gate, #15 bundled binaries, #16 <250-line components; Electron paste stays inline per Architecture note |
| Testability | 7 | HWND guard + fallback are unit-testable; correction/dictionary fully unit-testable; real paste still needs human G7 (unavoidable — flagged) |
| OSS maintainability | 9 | Fewer moving parts than current spike; deterministic correction is transparent; dictionary is plain JSON |

**Weighted average ≈ 8.4 / 10 → PASSES the ≥7/10 gate.** Proceed to Phase C PRD.

**Weakest link:** testability of real paste (7) — mitigated by making the *decision logic* (guard + fallback selection) unit-testable so only the final keystroke needs human verification at G7.
