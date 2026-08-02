# INTENT — M6: Public-Launch Parity (Bundled Local Intelligence + Cross-Platform Foundation)

**Milestone:** M6 — "Public Horizon"
**Date:** 2026-07-08
**Author:** Oracle SpeakFlow (Intent altitude)
**Consumer:** Frontier PRD/Spec author = **Fable 5** (`claude-fable-5-thinking-high`) @ Oracle-SpeakFlow repo root
**Status:** ✅ **Gate B0 APPROVED (2026-07-08)** — DOM signed P1–P4, hypothesis/falsification, M-3/M-4 floors, Parity-then-Proof, macOS→Linux order, C-1…C-10, Fable→Opus→Sonnet routing. Amendments: none. GitHub Pro: YES / later (before first private `macos-latest` wave). **Next: paste §13A to Fable 5.**
**Altitude:** **Intent only** — problem, bet, falsification, outcomes, constraints, and the research/adversarial work to commission. **No file trees, no APIs, no library/version choices, no implementation steps** — those belong to Fable 5's PRD (intent altitude) and Spec (engineering altitude).

**Provenance (read all from disk before PRD):**
- Competitive analysis: Handy (~24k★, MIT, cross-platform), OpenWhispr (~4k★, MIT, cross-platform), VoiceInk (~5k★, GPL v3, macOS) — see §1 evidence.
- Prior milestone canon (the proven pipeline): `docs/DESIGN/QUANTUM_LEAP_PRD.md`, `docs/DESIGN/QUANTUM_LEAP_SPEC.md`, `docs/DESIGN/WARGAME-speakflow-quantum-leap.md`, `docs/DESIGN/storm-reports/speakflow-quantum-leap-2026-briefing.md`.
- Repo law: `CLAUDE.md` (invariants #1–#19).
- Brownfield ground truth: `src/services/transcription.ts`, `src/electron-main.ts` (model downloader), `src/utils/binaryPath.ts` (`getVerifiedModelPath` + `models.sha256`), `src/services/paste.ts`, `README.md`, `package.json` (electron-builder `mac`/`win` targets).

---

## 0. How we build this (process — answers DOM's questions)

**Q: Best way to do this? Fable 5? STORM + WARGAME?** — **Yes to all three.** Do **not** freelance the PRD. Reuse the exact pipeline that produced the Quantum Leap milestone, because it is already proven in this repo and produced world-class, adversarially-scored specs.

```
Lane 0 (this doc)      Library Architect / Opus-class       → INTENT (forensic problem + commission)      ── Gate B0 (DOM approves)
     ↓
Lane 1  STORM          Fable 5 (claude-fable-5-thinking-high) @ repo root  → 5-lens briefing (.md)         ── verification banner truthful
     ↓
Lane 2  WARGAME        Fable 5                              → adversarial pre-mortem, score ≥7/10          ── Gate: score ≥7/10
     ↓
Lane 3  PRD            Fable 5                              → brownfield PRD (intent altitude)             ── Gate C1 (DOM approves PRD)
     ↓
Lane 4  SPEC           Opus 4.8 (claude-opus-4-8-thinking-high) @ repo root → engineering spec + gates + waves ── Gate D1 (DOM approves spec)
     ↓
Lane 5  BUILD/VALIDATE Sonnet 4.5 (claude-sonnet-5-thinking-high*) @ repo root → implement per STOP-gated waves ── human smoke gates
                       * nearest available Sonnet-class model; use sonnet-tier per model-routing.md
```

**Model routing rationale (locked — matches `cole-model-lane-routing-pattern.md`):**

| Lane | Model | Why |
|------|-------|-----|
| STORM + WARGAME + PRD | **Fable 5** | Highest research bandwidth + adversarial reasoning; owns the *what/why* |
| SPEC | **Opus 4.8** | Deepest engineering reasoning for the *how* — module contracts, gate matrix, wave sequencing; separate session from PRD so it reads the approved C1 PRD cold |
| Build + Validate | **Sonnet 4.5** | Implements + proves per the Spec contract; faster iteration; does not redesign |

**Handoff discipline (each frontier hands off to the next):** Fable 5 ends with a one-paragraph "Gate C1 reached; next: Opus 4.8 Spec, paste this Intent + PRD." Opus 4.8 ends with "Gate D1 reached; next: Sonnet 4.5 build Wave 1.0, paste this Spec." Each tier reads only from what the prior tier approved — no cold re-derivation.
- **Why STORM here:** this milestone has genuine multi-viewpoint unknowns with real trade-offs (which local models, GPU vs CPU, bundle size vs accuracy, macOS Accessibility injection, notarization economics). That is exactly what STORM's five verified lenses exist for. A single-shot PRD would invent the answers.
- **Why WARGAME here:** the paste-focus fix touches Invariant #18 (never steal foreground) — the single most dangerous surface in the app — and cross-platform injection multiplies the failure modes. Adversarial pre-mortem before PRD is non-negotiable; the Quantum Leap WARGAME caught the wrong-target-paste class before a line of code.
- **Repo stays private** through this whole chain (DOM decision — IP/file-path hygiene). It goes public **only** after M6 polish. macOS builds are produced by **GitHub Actions on private-repo runners** and stay private until launch.

---

## 1. Problem (forensic — evidence-cited to current code)

Oracle SpeakFlow has **best-in-class safety engineering** (paste guard, HWND ladder, mute kill-switch that closes the mic device, 138 unit + 38 UI + Playwright tests) but is **not yet at parity** with the top free open-source Whisper flows, and **cannot go public** in its current state without three credibility-damaging gaps. Each is a ground-truth fact, not an opinion:

### P1 — "Local intelligence" is a developer path masquerading as a user feature (violates Invariant #15)
- `src/services/transcription.ts::transcribeLocal` **spawns `whisper-cli.exe` per utterance** (`spawnSync`, writes WAV to temp, reads back `.txt`). No streaming, no GPU path, cold-process cost every cycle.
- The binary is **not bundled**. `README.md` step 3 and `CLAUDE.md` say the user must **manually place `whisper-cli.exe` in `resources/bin/`** (`.gitkeep` placeholder; "not auto-downloaded"). This **directly violates repo Invariant #15 — Zero-Friction Bundling: "All binaries must be bundled… Never require the user to run `winget` or `brew`."**
- Only model shipped/downloaded is **`ggml-tiny.en.bin`** — the **lowest** accuracy tier — and its `MODEL_SHA256` carries a **`TODO(M2-ship)` unverified-hash** note in `electron-main.ts`.
- **Consequence:** README claims "Local intelligence ✅ shipped," but no ordinary user can actually run offline. Competitors bundle inference and ship multiple accuracy tiers out of the box (Handy: Small/Medium/Turbo/Large + Parakeet V3; OpenWhispr: whisper.cpp + sherpa-onnx; VoiceInk: whisper.cpp + Parakeet). **This is the single largest parity gap, and it is a false claim in a public README.**

### P2 — Only the worst model tier exists; accuracy will be the #1 user complaint
- No user-selectable accuracy/speed tier. `tiny.en` mistranscribes exactly the technical/dev vocabulary this tool targets. Every peer offers a tier ladder; SpeakFlow offers the floor.

### P3 — The paste-first product still pastes into itself when its own window is focused
- Quantum Leap shipped paste v2 (keep-focus + HWND/class guard + clipboard fallback; Invariant #18 forbids `SetForegroundWindow`). **Residual, documented bug:** when the SpeakFlow tray window is **open and focused**, `Ctrl+V` targets SpeakFlow, not the user's chat (session handoff `oracle-speakflow-2026-05-15-eod.md`; README troubleshooting). Workaround today = "hide window before dictating."
- For a product whose entire promise is "your words appear where you're typing," a **paste-lands-in-the-wrong-window** path is a P0 for public launch — and the fix is genuinely hard because it **must not** violate Invariant #18 (no focus-steal to SpeakFlow); it must restore the **user's previous** foreground target.

### P4 — Windows-only in a category defined by cross-platform; cannot prove macOS viability
- `CLAUDE.md`: "Windows 11 only." Platform-specific surfaces everywhere: DirectShow FFmpeg GUID capture, `win32-foreground`/`win32-window`, `uiohook-napi`, `@nut-tree-fork/nut-js`, Windows terminal class table.
- `package.json` has a **`mac: { target: ["dmg"] }` stub** but **no `.github/workflows`** exist — there is **no CI, no macOS build, no artifact**. DOM has stated macOS must be built via **GitHub Actions** (no local Mac, and to keep IP/paths private until launch).
- The two strongest peers (Handy, OpenWhispr) ship macOS + Windows + Linux from one codebase. Until SpeakFlow at least **builds and launches on macOS in CI**, it is a Windows utility, not "an open-source Whisper flow."

**Who struggles, and in what context:** the solo maintainer (DOM) cannot honestly publish this as a world-class OSS Whisper flow; and the target user (developers wanting hands-free, private, offline dictation into their IDE) cannot get working offline transcription, decent accuracy, reliable paste, or a Mac build.

---

## 2. Hypothesis

We believe that if Oracle SpeakFlow (a) **bundles a local inference engine and at least one usable model so a fresh install transcribes offline with zero manual binary steps**, (b) offers **a small ladder of accuracy/speed model tiers** the user can choose, (c) closes the **paste-into-own-window** gap so dictation lands in the user's real target **without ever stealing foreground to SpeakFlow**, and (d) proves cross-platform viability by **producing a launchable macOS build in GitHub Actions CI**, then Oracle SpeakFlow reaches **credible public-launch parity** with Handy/OpenWhispr on the axes that matter (works offline out of the box, accurate enough for dev speech, pastes reliably, installs on more than one OS) **while keeping its differentiators** (paste safety, hands-free-first, mic-device kill-switch, MCP), making it defensible to open-source publicly.

### Wrong condition (falsification) — required
The bet is **wrong** — and we stop/pivot rather than iterate — if, after the thin-slice:
- **Bundled-local still requires any manual step** for a first-run user to transcribe offline (P1 not actually closed) → the bundling approach failed; escalate engine/packaging choice, do **not** ship "local ✅" again.
- **Bundled artifact size or model download makes the installer unshippable** (e.g. installer/download so large it is hostile to users) with no acceptable tier that fits → viability failure; re-scope models.
- **Any paste fires into the wrong window / into SpeakFlow after the P3 fix**, OR the fix requires stealing foreground to SpeakFlow (violates Invariant #18) → safety floor breached; revert to hide-window workaround and block the "paste-while-focused" claim.
- **macOS CI cannot produce a build that launches and reaches the transcription path** within the milestone → cross-platform viability unproven; macOS becomes an explicit non-goal again and we ship a Windows-only public v1 with that stated honestly.

### De-risk focus (this bet)
- [x] **Feasibility** — can we bundle inference + build on macOS in CI at all?
- [x] **Value** — does out-of-box offline + tiers + reliable paste actually move users from "prototype" to "I'd install this"?
- [x] **Viability** — bundle size, model licensing, notarization cost/complexity, maintenance burden of N platforms.
- [ ] Usability (secondary) — tier picker + first-run must stay obvious.

---

## 3. Success metrics (outcomes, not features)

| # | Metric | Target | How measured |
|---|--------|--------|--------------|
| M-1 | **Zero-manual offline path** | Fresh install → speak → corrected text pasted, **network disabled, no manual binary/model steps beyond an in-app one-click** | Human smoke on a clean machine/VM |
| M-2 | **Accuracy lift over `tiny.en`** | User-selectable tier measurably reduces dev-vocab errors vs `tiny.en` on a fixed spoken script | Fixed 10-utterance dev script, error count per tier |
| M-3 | **Paste-while-focused reliability** | With the SpeakFlow window open **and focused** at dictation start, corrected text lands in the **user's prior target** on ≥9/10 utterances; **0** pastes into SpeakFlow | Human smoke (mirror of Quantum Leap G7) |
| M-4 | **Invariant #18 preserved** | **0** calls to `SetForegroundWindow`/`AttachThreadInput` in the paste path; SpeakFlow never becomes foreground as a side effect of paste | Code grep-gate + human observation |
| M-5 | **macOS CI artifact** | GitHub Actions produces a macOS build artifact that **launches** and reaches the transcription pipeline (at minimum: cloud path; local path if feasible) | CI run + human launch smoke on macOS |
| M-6 | **No Windows regression** | All existing gates (typecheck, unit, UI, integration, MCP, Quantum Leap G7/G11) stay green on Windows | Existing gate matrix |
| M-7 | **Honest README** | Public README claims match shipped reality (no "local ✅" unless M-1 passes) | DOM review at launch |

**Non-negotiable safety floor (hard gates):** M-3's "0 into SpeakFlow" and M-4 are hard — a breach blocks the milestone regardless of other progress.

---

## 4. Thin-slice MVP (one end-to-end falsifiable path)

**One sentence:** On a **fresh Windows install with networking disabled**, a user clicks one in-app control to enable local mode, then — with the **SpeakFlow window open and focused** — speaks a dev sentence and the corrected text appears in their **previously-focused editor/chat** (not in SpeakFlow), using a **bundled inference engine** at a **user-chosen model tier**, offline; **and** a parallel proof exists that the **same codebase builds and launches on macOS via GitHub Actions**.

This single motion exercises all four pillars at once:
- **P1 bundled local** (no manual `whisper-cli.exe`; engine + at least one model present/one-click),
- **P2 tiers** (the tier the user selected is the one that ran),
- **P3/P4 paste-focus fix** (focused-window case resolves to the prior target, never SpeakFlow, never a focus-steal),
- **macOS CI viability** (green build artifact that launches).

**Explicitly NOT a "smaller v1" of the full product** — deferred out of the thin slice: full macOS/Linux *feature* parity, GPU acceleration, winget/Homebrew distribution, notarized signed installers, streaming, model auto-management UX polish. (See §6.)

---

## 5. Locked constraints (non-negotiable — the PRD/Spec must honor)

| # | Constraint | Basis |
|---|------------|-------|
| C-1 | **Bundling honors Invariant #15** — no user `winget`/`brew`/manual binary drop to reach the offline path. One-click in-app model acquisition is acceptable; a manual filesystem step is not. | Invariant #15; P1 |
| C-2 | **Model integrity gate reused, not reinvented** — bundled/downloaded models verified via the existing `getVerifiedModelPath` + `models.sha256` discipline; **hash mismatch or missing model → hard-BLOCK + notify, no silent degradation.** | Invariant #13; global CLAUDE #13 (hard-block gates); existing `binaryPath.ts` |
| C-3 | **Paste fix must NOT steal foreground to SpeakFlow.** The focused-window case must restore/route to the user's **prior** target or degrade to clipboard+toast — never `SetForegroundWindow`/`AttachThreadInput`. | Invariant #18; P3 |
| C-4 | **Single mic owner preserved** across any platform work — no renderer `getUserMedia`, one capture owner. | Invariant #17 |
| C-5 | **No paste/record while muted** survives all refactors; kill-switch still closes the mic device (OS indicator dark). | Invariant #19 |
| C-6 | **No Windows regression.** Every existing gate stays green; cross-platform code is additive/branching, not a rewrite of the Windows path. | M-6 |
| C-7 | **MIT, no lock-in, BYO Groq key.** Cloud remains optional; **local failure must NOT silently send audio to the cloud** — cloud fallback requires explicit prior user consent (privacy tool). | License; Invariant #13 tension (see OQ-6) |
| C-8 | **Component density** — new UI (tier picker, first-run) obeys Invariant #16 (<250-line Svelte components, composition). | Invariant #16 |
| C-9 | **Repo stays private; macOS built in GitHub Actions.** No public push, no secrets/paths in artifacts, until DOM's launch sign-off. | DOM decision |
| **C-10** | **macOS CI is a rare, deliberate gate — not an agentic loop.** macOS GitHub Actions runs **only** via `workflow_dispatch` and/or release tags (or an explicit maintainer-triggered job). **Forbidden:** `on: push` / `on: pull_request` that always schedules `macos-latest` for every commit during private development. **Budget intent:** ~1–3 deliberate Mac package/launch proofs per day max while private (Pro private-repo minutes; macOS billed **10×**). Linux/Windows CI may run more freely. Spec must name caching (`actions/cache` for npm/Electron/models) so each Mac run is not a cold-download tax. | Private-repo Actions multipliers; stay-on-track (see §5b) |

---

## 5b. Why C-10 exists (stay-on-track — read this before Spec)

**DOM preference:** platform order after Windows upgrades = **macOS CI proof first, then Linux** (M7). Linux-first was an *efficiency* option only — **not required**.

**Why few deliberate Mac runs (not “iterate on every push”):**

1. **Private-repo billing:** On Free/Pro, Actions minutes for *private* repos are limited (Pro ≈ 3,000 min/month). Public repos get Actions free; until SpeakFlow goes public, the private quota applies.
2. **macOS is 10×:** each Mac minute counts ~10× vs Linux. ~3,000 private minutes ≈ **~300 macOS minutes** — roughly **25–35 full Electron package jobs** if each is ~8–12 min. An agent/Sonnet loop that re-runs Mac CI on every fix **blows the monthly quota in one afternoon** and stalls the milestone.
3. **No local Mac substitute from Windows:** You cannot Dockerize or meaningfully “verify then push” a codesigned Electron/macOS build from a Windows machine. Mac CI *is* the feedback loop — so it must be **batched and rare**, after Windows (and later Linux) gates are already green locally/CI.
4. **M6 Mac scope is proof, not parity:** Goal is **build + launch (+ reach transcription)** — not full native paste/hotkeys. That keeps Mac run count small enough that C-10 is realistic.

**Stay-on-track rule for Fable Spec / Sonnet implementers:**  
Fail fast on **Windows** (local) → push → optional **Windows/Linux** CI → only when a slice is *candidate-ready*, DOM or implementer triggers **one** macOS `workflow_dispatch` → read logs/artifact → fix offline → trigger again. Never auto-schedule Mac on every commit.

---

## 6. Non-goals (explicit deferrals this cycle)

- **Full macOS/Linux feature parity** — this cycle proves **macOS *builds + launches + reaches transcription* in CI**, not full native paste/hotkey/mic parity. Linux is out entirely this cycle.
- **GPU acceleration** (CUDA/Metal/Vulkan whisper.cpp builds) — CPU-correct first; GPU is a follow-on.
- **Distribution channels** (winget, Homebrew cask, notarized/signed installers, auto-updater) — post-launch milestone.
- **Parakeet / non-Whisper engines as the default** — may be evaluated by STORM as a tier option, but the milestone name and Invariant framing stay Whisper-first unless STORM+WARGAME overturn it with DOM sign-off.
- **Streaming transcription, speaker diarization, meeting/notes/AI-agent surface** (OpenWhispr territory) — not this cycle.
- **Multi-language correction** — English dev vocabulary first (unchanged).

---

## 7. Scope recommendation for DOM (decide at Gate B0)

macOS full parity and "bundled local + tiers + paste fix" are **two very different sizes of work**. Author recommendation, for DOM to accept or override:

**RECOMMENDED — "Parity-then-Proof" scoping:**
1. **Primary (must land):** P1 bundled local + P2 tiers + P3 paste-focus fix, **all on Windows**, fully gated and public-README-honest.
2. **Proof (must exist, may be partial):** P4 = macOS **CI that builds and launches** the app to the transcription path (cloud at minimum), under **C-10** (few deliberate Mac runs — `workflow_dispatch`/tags only). This unblocks the public repo and proves the codebase is portable **without** committing to full native macOS UX this cycle.
3. **Platform order (DOM preference):** **macOS proof before Linux.** Linux feature/CI work is **M7**, after Mac proof. Linux-first is *not* required.
4. **Deferred:** full macOS paste/hotkey/mic native parity + Linux → **M7**.

**Rationale:** the public-launch blockers are the false "local ✅" claim (P1/P2) and the wrong-window paste (P3). Those are Windows-solvable now and are the highest impact ÷ effort. Full macOS native injection (Accessibility API `AXUIElement`, CoreAudio capture, macOS hotkeys, notarization) is a milestone of its own; forcing it into this cycle risks the never-cut items. A green macOS CI build is the honest, sufficient "cross-platform is real" signal for launch. **C-10 prevents burning private-repo macOS minutes (10×) on agentic CI loops.**

`_Scope approved by DOM: Parity-then-Proof — YES (2026-07-08)_`
`_Platform order approved: macOS CI proof then Linux (M7) — YES (2026-07-08)_`
`_C-10 macOS CI discipline accepted: YES (2026-07-08)_`

---

## 8. STORM commission (Fable 5 runs after B0; save to `docs/DESIGN/storm-reports/`)

**Topic:** *Shipping bundled, multi-tier local Whisper inference and a launchable macOS build for a privacy-first, cross-platform open-source desktop dictation app in 2026 — engine choice, model tiers, bundle-size/accuracy trade-offs, foreground-safe paste on Windows and macOS, and GitHub-Actions macOS packaging economics.*

**Reader role:** Solo OSS maintainer preparing a public launch, optimizing for out-of-box reliability and honest claims.

**Slug:** `speakflow-public-launch-parity-2026`

**Run the full 4-phase pipeline** (5 parallel lenses → contradiction map → HTML/MD synthesis → adversarial verification with a truthful verification banner). Each lens must produce **primary-source-cited, load-bearing** findings on these questions:

- **Practitioner:** What do Handy/OpenWhispr/VoiceInk actually bundle and how (engine, model files, download-on-first-run vs shipped-in-installer, GPU handling)? What breaks in packaged Electron for native inference binaries? Real installer sizes.
- **Academic:** Current WER/RTFx/VRAM/disk for candidate local models (Whisper tiny/base/small/medium/large-v3/large-v3-turbo/distil; Parakeet TDT/V3; Moonshine) — with the accuracy-vs-size-vs-speed frontier for **English dev speech on CPU**.
- **Skeptic:** Where does "bundle whisper.cpp" go wrong (per-config crashes — Handy openly reports Whisper crashes on some Windows configs; ORT/native addon asar-unpack hazards; model-download reliability/mirrors; macOS Gatekeeper/notarization blocking unsigned CI builds from launching)? Steelman "don't bundle, stay cloud."
- **Economist:** Real cost/effort of macOS CI (GitHub Actions macOS runner minutes on a private repo), Apple notarization ($99/yr + workflow), and the maintenance tax of N platforms × M models. Bundle size → user-abandonment economics.
- **Historian:** How did cross-platform desktop dictation tools (Dragon, Talon, whisper.cpp forks) handle model distribution and platform expansion — what patterns survived, what killed projects (abandonment via maintenance burden is the cautionary case).

**Mandatory close-the-gap outputs** (STORM must land explicit findings on): (a) recommended engine + **specific tier ladder** with sizes/licenses; (b) **ship-in-installer vs one-click-download** decision with bundle-size numbers; (c) **macOS paste/injection** sanctioned approach (Accessibility API) and whether it's in-scope this cycle; (d) whether an **unsigned GitHub-Actions macOS build can launch** (Gatekeeper reality) and what the minimum viable signing/notarization step is; (e) the **local-fail → cloud** privacy stance (silent vs consented).

---

## 9. WARGAME commission (Fable 5 runs after STORM; save to `docs/DESIGN/`; pass gate ≥7/10)

Adversarial pre-mortem in the exact format of `WARGAME-speakflow-quantum-leap.md` (competing-approach matrix → red-team scenario table `Trigger → Failure → Detection → Mitigation → Owner file` → timeline war-game → independent adversarial score). **Gate: weighted score ≥7/10 before PRD.** Required scenarios that MUST be stress-tested:

| # | Adversarial scenario to red-team |
|---|-----------------------------------|
| W-1 | Bundled inference binary fails to load in **packaged** Electron (asar/`__dirname`/native-addon) on a clean machine — detection + hard-block, no silent cloud leak (C-2/C-7). |
| W-2 | Model download mid-first-run fails / mirror down / partial file → SHA mismatch — hard-block + retry UX, never run a corrupt model (C-2). |
| W-3 | Installer/model size so large users abandon — the ship-in-installer vs one-click download trade-off, with numbers. |
| W-4 | **Paste-while-SpeakFlow-focused fix regresses into a focus-steal** (violates #18) or races the prior-window restore → wrong-window paste. This is the highest-risk surface; needs the deepest treatment (mirror Quantum Leap S1/S2/S18). |
| W-5 | macOS CI produces an artifact that **won't launch** (Gatekeeper/quarantine/unsigned) — is the milestone's macOS proof actually achievable, or is a minimal signing step mandatory? |
| W-6 | Cross-platform branching **regresses the Windows paste/capture path** (C-6) — how is the Windows gate matrix protected? |
| W-7 | Local model produces worse output than cloud and silently degrades user trust — tier defaults + honest first-run expectations. |
| W-8 | Per-config local inference crash (Handy's documented Windows reality) — graceful hard-block + guidance, not a hang. |
| **W-9** | **macOS CI thrash burns private-repo minutes (10×)** — Spec/implementer schedules `macos-latest` on every push; quota exhausted mid-milestone. Detection: Actions usage chart. Mitigation: **C-10** — `workflow_dispatch`/tags only; cache npm/Electron/models; fail-fast on Windows first. |

Also produce the **best-in-class parity bar** table (match/beat/deliberately-not, honest) as in the Quantum Leap spec §0.2, updated for M6 (out-of-box local, tiers, cross-platform build).

---

## 10. Open questions (resolve in PRD/Spec, not here)

| # | Question | Owner to resolve |
|---|----------|------------------|
| OQ-1 | Which inference engine + exact tier ladder (sizes, licenses, default tier)? | STORM → PRD |
| OQ-2 | Ship models in the installer vs one-click first-run download (or hybrid: bundle smallest, download larger)? | STORM → PRD |
| OQ-3 | Per-utterance `spawnSync` today — move to a persistent/streaming local process, or is batch-per-utterance acceptable for v1? | Spec |
| OQ-4 | Exact mechanism for the paste-while-focused fix that restores the **user's prior** foreground target **without** #18 violation (record prior HWND at dictation start; route paste there; else clipboard+toast). | WARGAME → Spec |
| OQ-5 | macOS scope boundary: CI-build-and-launch only, or attempt native paste (Accessibility API) this cycle? | §7 DOM decision → PRD |
| OQ-6 | **Local-fail → cloud privacy stance:** hard-block-and-notify vs consented cloud fallback. (Author leans hard-block + explicit opt-in for a privacy tool.) | PRD |
| OQ-7 | GPU acceleration: confirmed **out** this cycle, or a stretch tier if trivial on one platform? | PRD |
| OQ-8 | Minimum viable macOS signing/notarization to let a CI build launch (vs `xattr` guidance for testers). | STORM → Spec |

---

## 11. Assumptions (flagged — validate before/within PRD)

- **A-1:** `whisper.cpp` (already referenced in repo/README) is the presumptive engine; STORM may override with Parakeet/sherpa-onnx — **validate in STORM.**
- **A-2:** `getVerifiedModelPath` + `models.sha256` (built for Silero in Quantum Leap) extends cleanly to Whisper model files — **validate in Spec.**
- **A-3:** DOM upgrades to **GitHub Pro** (or equivalent) for the private build window (~3,000 private Actions min). Combined with **C-10**, Pro is sufficient for scarce deliberate Mac proofs; Free (~200 Mac-equivalent minutes) is tight. **Validate account plan before first `macos-latest` wave.**
- **A-4:** The paste-focus fix can capture the prior-foreground HWND at dictation start on Windows without new native deps (Quantum Leap already captures target HWND at speechStart/keydown) — **validate in WARGAME.**
- **A-5:** DOM has (or will obtain) an Apple Developer account if OQ-8 requires notarization — **flag to DOM.**

---

## 12. Human Gate B0 — STOP

**This is an Intent at Lane-0 altitude. Do NOT run STORM, WARGAME, PRD, or Spec until DOM approves:**
- the **problem framing P1–P4** and that they are the public-launch blockers (§1),
- the **hypothesis + falsification** incl. the safety floor (§2–3),
- the **thin-slice MVP** (§4) and **locked constraints C-1…C-10** (§5 + §5b),
- **C-10** macOS CI discipline (few deliberate Mac runs; stay-on-track rationale),
- the **non-goals** (§6),
- the **scope recommendation** (§7 — Parity-then-Proof; **macOS proof then Linux M7**),
- and the **STORM + WARGAME commissions** (§8–9, incl. W-9).

`_Approach approved by DOM: YES — Gate B0 APPROVED 2026-07-08_`
`_C-10 + macOS-then-Linux order approved: YES (2026-07-08)_`
`_GitHub Pro for private window: YES / later (before first macos-latest wave)_`

**B0 sign-off record (verbatim):**
```
P1–P4: YES | Hypothesis + falsification + M-3/M-4 floors: YES
Scope: Parity-then-Proof — YES | Order: macOS CI proof → Linux (M7) — YES
C-1…C-10: YES | Process: Fable 5 → Opus 4.8 Spec → Sonnet 4.5 — YES
Amendments: none → Proceed: paste Intent §13A to Fable 5
```

---

## 13. Handoff — three-tier prompt chain (B0 approved → paste each in order)

---

### 13A — Fable 5 (STORM + WARGAME + PRD)

> Open Cursor at `C:\Users\User\Projects\Oracle-SpeakFlow`, select **Fable 5** (`claude-fable-5-thinking-high`), and paste:

```
You are the STORM + WARGAME + PRD author for Oracle SpeakFlow milestone M6.
Your deliverable ends at Gate C1. You do NOT write the Spec — that is Opus 4.8 in a separate session.

READ FROM DISK FIRST (authority, in order):
1. docs/DESIGN/INTENT-m6-public-launch-parity.md      ← approved Intent — your commission (read ALL sections)
2. CLAUDE.md                                           ← invariants #1–#19 (law)
3. docs/DESIGN/QUANTUM_LEAP_PRD.md
   docs/DESIGN/WARGAME-speakflow-quantum-leap.md
   docs/DESIGN/storm-reports/speakflow-quantum-leap-2026-briefing.md   ← house style
4. Brownfield: src/services/transcription.ts, src/electron-main.ts, src/utils/binaryPath.ts,
   src/services/paste.ts, README.md, package.json

DO, IN ORDER, STOPPING AT EACH GATE:
A. STORM  — run the full 4-phase storm-research pipeline (Intent §8). Save to
   docs/DESIGN/storm-reports/speakflow-public-launch-parity-2026-briefing.md
   Truthful verification banner. Land the five mandatory close-the-gap outputs.
B. WARGAME — adversarial pre-mortem (format of WARGAME-speakflow-quantum-leap.md),
   covering W-1…W-9 (Intent §9). Save to docs/DESIGN/WARGAME-m6-public-launch-parity.md
   GATE: weighted adversarial score ≥7/10 before PRD.
C. PRD — brownfield PRD at INTENT ALTITUDE (what/why, falsification, success metrics,
   locked decisions, deferral order). Save to docs/DESIGN/M6_PUBLIC_LAUNCH_PRD.md
   Honor C-1…C-10 (incl. macOS CI discipline §5b). STOP at Gate C1 — DOM must approve.

END with a one-paragraph handoff stating: files produced, Gate C1 reached,
and the exact paste block for the next operator step (Opus 4.8 Spec session).

HARD RULES: no Spec, no code, no branch. Never violate #15/#13/#18/#17/#19.
C-10: macOS CI = workflow_dispatch/tags only; NEVER macos-latest on every push. C-7: local failure must NOT silently send audio to cloud.
```

---

### 13B — Opus 4.8 (SPEC) — paste AFTER Gate C1 approved

> New Cursor session at repo root, select **Opus 4.8** (`claude-opus-4-8-thinking-high`), paste:

```
You are the SPEC author for Oracle SpeakFlow milestone M6.
PRD (Gate C1) is approved. Your deliverable ends at Gate D1. You do NOT implement — that is Sonnet 4.5.

READ FROM DISK FIRST:
1. docs/DESIGN/INTENT-m6-public-launch-parity.md      ← approved Intent
2. docs/DESIGN/M6_PUBLIC_LAUNCH_PRD.md                ← approved PRD (C1)
3. docs/DESIGN/WARGAME-m6-public-launch-parity.md     ← adversarial findings
4. docs/DESIGN/storm-reports/speakflow-public-launch-parity-2026-briefing.md  ← STORM findings
5. CLAUDE.md                                           ← invariants #1–#19 (law)
6. docs/DESIGN/QUANTUM_LEAP_SPEC.md                   ← house style for Spec altitude
7. Brownfield: src/services/transcription.ts, src/electron-main.ts, src/utils/binaryPath.ts,
   src/services/paste.ts, src/utils/config.ts, package.json (electron-builder targets)

PRODUCE: docs/DESIGN/M6_PUBLIC_LAUNCH_SPEC.md — engineering altitude:
- File touch list (new + modified)
- Module contracts (types, exported functions, error shapes)
- Config / migration (extending existing .env discipline)
- Gate matrix G-series (extend Quantum Leap G1–G12; add bundled-local, tier-picker, paste-focus, macOS-CI gates)
- STOP-gated implementation waves (Wave 1.0 spike first, same discipline as Quantum Leap)
- CI runner policy section: cite Intent C-10 (macOS = workflow_dispatch/tags only; caching mandate; Linux/Windows free-run)
- Honest feasibility re-score + adversarial re-review (§9b format)
STOP at Gate D1 — DOM must approve before any code or branch.

END with handoff: files produced, Gate D1 reached,
and exact paste block for Sonnet 4.5 Wave 1.0.

HARD RULES: no code, no branch. Honor all PRD locked decisions. C-10 must appear in CI policy section.
```

---

### 13C — Sonnet 4.5 (BUILD + VALIDATE) — paste AFTER Gate D1 approved

> New Cursor session at repo root, select **Sonnet 4.5** (or nearest Sonnet-class), paste:

```
You are the implementer for Oracle SpeakFlow milestone M6.
Spec (Gate D1) is approved. Implement per STOP-gated waves. Do not redesign.

READ FROM DISK FIRST:
1. docs/DESIGN/M6_PUBLIC_LAUNCH_SPEC.md   ← approved Spec — your contract (read ALL sections)
2. CLAUDE.md                              ← invariants #1–#19 (law — never violate)
3. docs/DESIGN/M6_PUBLIC_LAUNCH_PRD.md   ← PRD for context (what/why)

RULES:
- Start with Wave 1.0 spike only. STOP at spike gate S1. Do not proceed to Wave 1.1 until S1 passes.
- Each wave ends with its gate(s). STOP and report to DOM before opening the next wave.
- macOS CI = workflow_dispatch only (Intent C-10). Never schedule macos-latest on push.
- Never violate #13/#15/#17/#18/#19. No SetForegroundWindow. No silent cloud fallback.
- Report gate results honestly (PASS/FAIL + evidence). Do not paper over failures.
```

---

**DOM completion checklist:**
1. Approve B0 (this Intent) → paste **13A** to Fable 5.
2. Review STORM verification banner + WARGAME score ≥7/10 → approve **Gate C1** (PRD).
3. Paste **13B** to Opus 4.8 → review Spec gate matrix + wave plan → approve **Gate D1**.
4. Paste **13C** to Sonnet 4.5 → sign each wave gate (S1, S2, S3) as they land.
5. Human smoke M-1…M-7 on final Wave 3 → go public.

---

*Authored by the Library Architect (Lane 0). This Intent is the approved input to Fable 5's STORM → WARGAME → PRD → Spec. It deliberately contains no file layouts, APIs, or library versions — those are Fable 5's to design and DOM's to gate.*
