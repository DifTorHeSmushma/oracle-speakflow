# Wargame — M6 Public-Launch Parity (Adversarial Pre-Mortem)

**Date:** 2026-07-08
**Inputs:** `storm-reports/speakflow-public-launch-parity-2026-briefing.md`, `INTENT-m6-public-launch-parity.md` (§9 scenarios W-1…W-9), repo code (`transcription.ts`, `electron-main.ts`, `binaryPath.ts`, `paste.ts`, `package.json`), `CLAUDE.md` invariants #1–#19.
**Purpose:** Stress-test every major M6 decision against failure before the PRD. Gate: weighted adversarial score ≥7/10.

---

## B1 — Competing approach matrix

### Axis 1 — Bundled local intelligence (P1/P2)

Evaluated on **out-of-box offline**, **installer size**, **latency**, **maintenance**, **Invariant #15/#13 compliance**.

| # | Approach | Win condition | Lose condition | Verdict |
|---|---|---|---|---|
| 1 | Status quo: user drops `whisper-cli.exe` manually (CURRENT) | — | Violates Invariant #15; README claim is false; no ordinary user reaches offline | **REJECT** — this is the P1 bug |
| 2 | Bundle engine only; all models one-click download | Small installer (+~20 MB) | Fails the networking-disabled thin slice (§4): fresh offline install cannot transcribe at all | REJECT as sole path |
| 3 | **Hybrid: engine + Fast tier (tiny.en, 77.7 MB) in installer; Balanced/Accurate one-click behind SHA gate** | Fresh install transcribes offline with zero downloads; ladder reachable in one click; installer ~200 MB (peer-normal) | Installer size hostile (not at +90 MB); download UX fails (covered by S2) | **PRIMARY** |
| 4 | Bundle everything (all three tiers) | Zero downloads ever | +840 MB installer — abandonment-grade (STORM F1/W-3) | **REJECT** |
| 5 | Switch engine to Parakeet / in-process ONNX | Deletes sidecar; CPU-fast | New engine + runtime + model format mid-milestone; unproven in repo; milestone is parity, not re-platform | REJECT for M6 — **M7 evaluation** (STORM 6th lens) |

### Axis 2 — Paste-while-SpeakFlow-focused (P3 / W-4)

Evaluated on **zero-wrong-window floor**, **Invariant #18 compliance**, **new-dependency cost**.

| # | Approach | Win condition | Lose condition | Verdict |
|---|---|---|---|---|
| 6 | `SetForegroundWindow` the prior target, then paste | Deterministic focus | **Forbidden** — Invariant #18; verified-unreliable from background (Quantum Leap F1) | **REJECT** |
| 7 | Status quo: own-window-focused → clipboard+toast | Never wrong window | User's headline motion ("dictate while glancing at the tray") stays broken; P3 unfixed | **FALLBACK FLOOR** (retained as guard outcome) |
| 8 | **Yield-focus ladder: track last external foreground while listening; if own window focused at capture → hide own window (yielding focus — the OS re-activates the prior window; SpeakFlow activates nothing) → settle delay → re-verify foreground == recorded prior target → paste; any mismatch → clipboard+toast** | Text lands in the user's real target ≥9/10; SpeakFlow never becomes/steals foreground; no new native deps (existing foreground reader + 1 s poll carry the tracker) | Z-order restore races or lands on an unexpected window — caught by the strict equality re-check, degrading to #7, never a wrong paste | **PRIMARY** |
| 9 | UIA `ValuePattern.SetValue` into prior control | Focus-independent | Per-app fragility; heavy; the standing 6th-lens deferral | REJECT for M6 |

**Decision rule applied:** PRIMARY #3 + #8, FALLBACK = existing clipboard+toast floor with **explicit triggers**: (bundling) any engine/model pre-flight failure → hard-block, never cloud; (paste) any verify mismatch, stale/closed prior target, or settle timeout → clipboard+toast, never a keystroke.

### Axis 3 — macOS proof (P4)

| # | Approach | Verdict |
|---|---|---|
| 10 | `macos-latest` on every push | **REJECT** — burns ~290 Mac-minutes/month in an afternoon (verified 10.3×; W-9) |
| 11 | **Single `workflow_dispatch`/tag-triggered packaging workflow, cached (npm/Electron/models), ad-hoc-signed artifact + written Gatekeeper launch-smoke script** | **PRIMARY** (C-10 compliant; STORM F3/F4) |
| 12 | Buy Apple Developer + notarize this cycle | REJECT — distribution-milestone work; not needed for a launch *proof* (STORM d) |

---

## B2 — Red-team scenario table (Trigger → Expected failure → Detection → Mitigation → Owner surface)

| # | Intent | Trigger | Expected failure | Detection | Mitigation | Owner surface |
|---|---|---|---|---|---|---|
| S1 | W-1 | Packaged Electron: bundled `whisper-cli.exe` absent/unlaunchable (asar path, missing DLL, blocked by AV) | Local mode dead on a clean machine; worst case silent cloud use | **Pre-flight probe at local-mode enable + app start**: binary exists AND `whisper-cli` answers a version/help spawn | Hard-BLOCK with actionable message; local stays selected-but-blocked; **cloud never auto-substitutes** (C-7) | binary resolution + packaged pre-flight; packaging config |
| S2 | W-2 | Model download: mirror down / partial file / HTTP 200-with-HTML | Corrupt model runs or user stuck | Existing SHA-256 verify on completion; size/content-length check during stream | Delete partial (already done), surface retry UX with backoff; per-tier manifest entry must exist before download offered | downloader + SHA manifest |
| S3 | W-2 | Hash authored wrong at dev time (the `TODO(M2-ship)` class — tiny.en's hash is *still* unverified in code today) | Correct file hard-blocks forever; users conclude "local is broken" | CI gate: manifest hashes cross-checked against upstream once per release; a `TODO` near a hash fails the gate | **No unverified hash ships** — release-blocking rule in PRD | SHA manifest authoring + CI |
| S4 | W-3 | Installer size drives abandonment | Users bounce before first run | Numbers, not vibes: hybrid = ~+90 MB (engine + tiny.en); Accurate tier is a 574 MB *opt-in* with size shown before download + disk pre-check | Hybrid locked (B1 #3); tier picker displays size/RAM guidance; never auto-download above default | packaging; tier picker UI |
| **S5** | **W-4** | Own window focused at capture; hide→settle race: foreground not yet the prior target when paste fires | **Wrong-window paste** — the milestone's hard floor | Strict re-verify: foreground HWND must **equal** the recorded prior external target after settle; no "close enough" class match in this path | On any mismatch/timeout → clipboard+toast; the paste keystroke is *never* sent on partial evidence | paste decision + inject sequencing |
| **S6** | **W-4** | Prior-target tracker is stale (window closed/minimized since last sample) | Paste aimed at a dead HWND, or Z-order restores focus to an unexpected app | Liveness check on the recorded HWND before yield; post-settle equality check catches the unexpected-app case | Clipboard+toast; tracker samples piggyback the existing 1 s poll while LISTENING (no new deps — validates Intent A-4) | foreground tracker |
| **S7** | **W-4** | Fix drifts into activation: someone "helps" the restore with `SetForegroundWindow`/`AttachThreadInput`, or `show()`/`focus()` re-enters the pipeline | Invariant #18 breached; M-4 fails | **CI grep-gate** for forbidden APIs in the paste path (M-4 is grep + human observation); code review rule: pipeline may only *hide* own window, never show/activate during inject | Gate blocks merge; yield-focus means SpeakFlow only ever gives focus away | CI gate; inject path |
| **S8** | **W-4** | Paste lands in SpeakFlow itself (regression of the exact P3 bug) | Hard-floor breach (M-3: 0 into SpeakFlow) | Existing final `ownHwndEquals` check retained **after** the yield ladder as the last gate before keystroke | Block → clipboard+toast; mirror of Quantum Leap G7 smoke re-run with window deliberately focused | paste decision (existing guard) |
| S9 | W-4 | User alt-tabs to a *different* app mid-transcription after yield | Text lands in the newly-focused app the user is now in — is that wrong? | Post-settle equality: foreground ≠ recorded prior target | Clipboard+toast (conservative: only the recorded prior target ever receives the keystroke in the focused-window flow) | paste decision |
| S10 | W-5 | macOS artifact won't launch: Gatekeeper block (verified Sequoia behavior) or arm64 refuses unsigned binary | M-5 read as "milestone failed" when it's a known OS gate | Launch smoke **script** includes the sanctioned steps: System Settings → Open Anyway (or `xattr -cr`); spike validates electron-builder ad-hoc signature is present | Ad-hoc signing confirmed in first CI spike (STORM R11 flag); if arm64 still refuses → minimal signing step escalated to DOM per falsification clause | mac CI workflow + smoke script |
| S11 | W-6 | Cross-platform branching regresses Windows paste/capture | The proven pipeline breaks for existing users | Full Windows gate matrix (typecheck, 138 unit, 38 UI, Playwright, G7/G11 smokes) required green on every PR — platform work is additive/branching (C-6) | Win32 modules are **not refactored** this cycle; mac divergence lives behind platform checks; Windows CI runs freely (Linux/Windows unmetered vs Mac) | CI policy; platform guards |
| S12 | W-7 | Local (esp. Fast tier) output visibly worse than cloud; trust erodes silently | "This app is bad," one-star class feedback | M-2 fixed 10-utterance dev-vocab script per tier, measured, published | Default tier is the *measured* best-within-budget (Balanced if spike passes); first-run copy sets honest expectations; one-click tier switch | tier defaults; first-run UX; M-2 protocol |
| S13 | W-8 | Per-config engine crash (documented Handy/whisper.cpp reality: some Windows configs, non-AVX CPUs) | Hang or cryptic failure loop | Existing spawn error/exit/timeout classification (`localTranscriptionFailed`); crash-loop counter (N failures → stop retrying) | Hard-block with guidance (try smaller tier, check CPU, link issue); offer **consented** cloud switch as an explicit action; never silent (C-7) | local transcription error surface |
| S14 | W-9 | Mac CI thrash: someone wires `on: push` for `macos-latest`, or an agent loops fixes through Mac CI | ~290 Mac-min/month quota gone mid-milestone (verified 10.3×) | Actions usage chart; PR review rule: any workflow touching `macos-*` must show `workflow_dispatch`/tags-only triggers | **C-10 verbatim in PRD + Spec CI-policy section**; caching mandate; fail-fast-on-Windows-first rule; budget 1–3 deliberate runs/day | CI workflow review |
| S15 | new | Resident engine (tier-latency fix) leaks: zombie process on quit, model held in RAM while muted/idle | Memory complaints; Invariant #8 breach on shutdown | Lifecycle contract in Spec: idempotent stop, kill on quit path, idle-unload policy | Residency is spike-gated; if lifecycle can't be proven clean, Fast tier (batch spawn) stays default and Balanced remains opt-in | resident-engine lifecycle (Spec) |
| S16 | new | Tier switch mid-utterance / mid-download | State-machine re-entry or half-configured engine | Invariant #6 guard: tier changes apply only from IDLE/LISTENING; download completion is atomic (verify-then-rename) | Queue/deny switches while pipeline active; UI disables apply during active states | settings apply path |
| S17 | new | First-run user on metered/offline network taps Balanced download | Surprise 190 MB pull or stuck progress | Size shown pre-download; download is cancellable/resumable-or-restartable; offline → immediate honest error | Fast tier already works offline out-of-box (hybrid), so offline first-run is never dead | downloader UX |
| S18 | new | Mac artifact leaks private paths/secrets while repo is private (C-9) | Pre-launch IP leak via artifact metadata | Artifact content review in first spike; no `.env`, no absolute user paths in bundle; CI logs scrubbed of secrets | Standard electron-builder output only; C-9 checklist in Spec's CI section | mac CI workflow |

---

## B3 — Timeline war-game (wave-shaped, mirrors Quantum Leap discipline)

| Slice | Deliverable | Human checkpoint | Kill criteria (cut if behind) |
|---|---|---|---|
| **Research** | STORM (done) + this Wargame + PRD → **Gate C1** | ✅ C1: PRD approval | — (research is load-bearing; do not cut) |
| **Wave 1 — bundled local + tiers (Windows)** | Engine bundled via `extraResources` + pre-flight hard-block; tier ladder + per-tier SHA manifest; **residency spike gates the default tier**; tier picker UI | Wave-1 gate: M-1 offline smoke on clean VM + M-2 per-tier script | Cut Accurate tier first; then residency (Fast default, batch spawn). **Never cut:** engine bundling, SHA gate, no-silent-cloud |
| **Wave 2 — paste-focus fix (Windows)** | Prior-external-foreground tracker; yield-focus ladder; CI grep-gate for forbidden APIs | Wave-2 gate: M-3 human smoke (window open **and focused**, ≥9/10, **0 into SpeakFlow**) + M-4 grep | Cut nothing here — if the ladder can't hit M-3, **revert to clipboard+toast floor and block the paste-while-focused claim** (falsification clause, honest README) |
| **Wave 3 — macOS CI proof** | `workflow_dispatch` packaging workflow, cached; ad-hoc-signed artifact; Gatekeeper launch-smoke script; **1–3 deliberate runs total expected** | Wave-3 gate: M-5 launch + cloud transcription reached on a Mac | Cut mac *local* path first (cloud proof suffices per M-5); if launch impossible without paid signing → escalate to DOM per falsification clause (mac becomes honest non-goal) |
| **Launch polish** | README honesty pass (M-7), CHANGELOG, claims regenerated from gate results | ✅ DOM launch review | — (honesty pass is never cut) |

**Explicit deferral ranking (first to cut):** macOS local transcription path → Accurate tier → engine residency (Fast-tier default fallback) → tier-picker polish/first-run copy.
**NEVER cut:** engine bundling (P1), per-tier SHA gate + no-unverified-hash rule, M-3/M-4 hard floors, no-silent-cloud (C-7), README honesty (M-7), C-10 CI discipline.

---

## B0.2 — Best-in-class parity bar (M6, honest)

| Axis | Handy | OpenWhispr | VoiceInk | SpeakFlow after M6 | Stance |
|---|---|---|---|---|---|
| Out-of-box offline transcription | ✅ (engine bundled, model 1st-run DL) | ✅ | ✅ | ✅ engine + Fast tier **in installer** (works offline with zero downloads) | **MATCH, slightly beat** (no first-run download needed) |
| Model tier ladder | ✅ 4 tiers + Parakeet | ✅ Whisper + Parakeet | ✅ | ✅ 3 Whisper tiers, SHA-gated | **MATCH** (Parakeet deliberately deferred to M7) |
| Model integrity verification | ⚠️ not prominent | ⚠️ not prominent | ⚠️ | ✅ SHA-256 hard-block manifest, all tiers | **BEAT** |
| Paste safety (wrong-window floor, focus discipline) | ⚠️ | ⚠️ | ⚠️ | ✅ guard + yield-focus ladder + 0-into-self floor + no-foreground-steal grep gate | **BEAT** (the differentiator) |
| Mic kill-switch that closes the device | ❌ | ❌ | ❌ | ✅ (shipped, preserved) | **BEAT** |
| Hands-free VAD-primary | ❌ (hotkey) | ❌ | ❌ | ✅ (shipped, preserved) | **BEAT** |
| MCP / agent surface | ❌ | ❌ | ❌ | ✅ | **BEAT** |
| Cross-platform shipped | ✅ Win/mac/Linux | ✅ Win/mac/Linux | macOS only | Windows shipped + **macOS CI-proven launchable** | **DELIBERATELY PARTIAL** — proof this cycle, parity M7, stated honestly |
| GPU acceleration | ✅ (when available) | ⚠️ | ✅ | ❌ | **DELIBERATELY NOT** (M6 non-goal) |
| Streaming / meeting notes | ❌ / partial | ✅ (notes surface) | partial | ❌ | **DELIBERATELY NOT** |
| Notarized/signed installers | ✅ | ✅ | ✅ | ❌ (ad-hoc + documented steps) | **DELIBERATELY NOT** this cycle (distribution milestone) |

---

## B4 — Adversarial score (independent evaluator persona)

Scoring the chosen strategy (hybrid bundling + tier ladder w/ residency spike + yield-focus paste ladder + dispatch-only mac CI proof):

| Criterion | Score /10 | Rationale |
|---|---|---|
| Safety-floor evidence (M-3/M-4 hard gates) | 9 | Yield-focus only ever *gives away* SpeakFlow's own focus; strict post-settle equality + retained own-window gate make wrong-window paste structurally unreachable — worst case is the existing clipboard+toast floor; grep-gate mechanizes M-4 |
| Feasibility within milestone | 8 | Bundling reuses `extraResources` + existing downloader/SHA machinery; tracker piggybacks an existing poll (A-4 validated); risk concentrates in the residency spike and mac spike — both gated with explicit fallbacks |
| Invariant compliance (#13/#15/#17/#18/#19, C-1…C-10) | 9 | #15 closed by the hybrid; #13 extended per-tier with the no-unverified-hash release rule; #18 honored by construction; #17/#19 untouched by design (C-4/C-5); C-10 mechanized in CI policy |
| Testability | 7 | Guard/tracker/decision logic and SHA/pre-flight paths are unit-testable; the yield-settle race and the mac Gatekeeper launch remain human smokes (M-3, M-5) — unavoidable, mitigated by making every decision input observable |
| Economics / maintainability | 8 | Verified CI arithmetic makes W-9 a solved budget, not a hope; one engine, one model family, three files; the M7 in-process-ONNX option is preserved, not foreclosed |
| Honest-launch readiness (M-7) | 9 | Every public claim maps to a gate result; falsification clauses pre-commit the honest downgrade paths (clipboard floor, Windows-only v1) |

**Weighted average ≈ 8.3 / 10 → PASSES the ≥7/10 gate.** Proceed to PRD.

**Weakest link:** testability (7) — the hide→settle→verify race and Sequoia's Open Anyway flow can only be humanly smoked. Mitigation: the *decision* layer stays pure and unit-tested (as `decidePaste` already is), so human smokes verify only OS behavior, not logic; M-3 mirrors the proven Quantum Leap G7 protocol.
