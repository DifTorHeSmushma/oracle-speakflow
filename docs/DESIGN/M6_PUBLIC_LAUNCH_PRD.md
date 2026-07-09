# M6 Public-Launch Parity PRD — Oracle SpeakFlow (Intent Altitude)

**Date:** 2026-07-08
**Author:** Fable 5 (STORM + WARGAME + PRD lane, per Intent §0 routing)
**Status:** ✅ **Gate C1 APPROVED (2026-07-08)** — DOM approved §1–§9 (all Q-C1 / L1–L15 YES; amendments: none). Spec is Opus 4.8 in a separate session (Intent §13B). Do not implement until Gate D1.
**Provenance:** `INTENT-m6-public-launch-parity.md` (Gate B0 approved 2026-07-08), `storm-reports/speakflow-public-launch-parity-2026-briefing.md` (5/5 load-bearing citations verified), `WARGAME-m6-public-launch-parity.md` (adversarial score 8.3/10 — gate passed).
**Altitude:** Intent only — *what and why*, falsification, metrics, locked decisions, deferral order. No file trees, no APIs, no library versions. Those live in the Spec (Gate D1).

---

## 1. Problem

Oracle SpeakFlow cannot honestly go public. Its README claims local intelligence that no ordinary user can reach (the inference binary must be hand-placed — a direct Invariant #15 violation, and a false public claim); the only model it can fetch is the lowest-accuracy tier, whose integrity hash is itself still marked unverified in code; the paste-first product still fails its core promise whenever its own window is focused (text degrades to clipboard instead of landing in the user's target); and it is Windows-only in a category whose leaders ship three platforms, with a mac build target stubbed but no CI and no artifact ever produced. These are the four public-launch blockers P1–P4 (Intent §1) — each verified against current code, none an opinion.

## 2. Hypothesis

If SpeakFlow **(a)** ships its inference engine and a smallest usable model *inside the installer* so a fresh install transcribes offline with zero manual steps, **(b)** offers a three-tier accuracy/speed ladder acquired one-click behind the existing integrity gate, **(c)** closes the paste-while-focused gap by *yielding its own focus* and verifying the user's prior target before any keystroke — never stealing foreground, and **(d)** proves portability with a macOS build that launches from a deliberately-triggered CI run, then SpeakFlow reaches credible parity with Handy/OpenWhispr on the axes that decide adoption (offline out of the box, accurate enough for dev speech, pastes reliably, more than one OS) while keeping its verified differentiators (paste safety, device-closing kill-switch, hands-free-primary, MCP) — making a public MIT launch defensible and honest.

**Observable outcome:** the thin slice of §5, demonstrated end-to-end on a clean machine, plus a green deliberately-triggered macOS CI artifact that a human launches.

## 3. Wrong condition (falsification — pre-committed downgrade paths)

The bet is **wrong** — and we take the named downgrade instead of iterating — if:

- **P1:** after the bundling wave, any manual binary/model filesystem step remains on the first-run offline path → the packaging approach failed; escalate engine/packaging to DOM; the README **must not** claim "local ✅" (M-7 enforces).
- **P2:** no tier above Fast meets the local latency budget even with a resident engine (the Wave-1 spike fails) → Fast stays the default, ladder ships as opt-in with honest copy; if even Fast breaches budget on reference hardware, local defaults off and the claim is scoped down.
- **P3:** any paste lands in the wrong window or in SpeakFlow after the fix, OR the fix cannot work without foreground-stealing → **revert to the clipboard+toast floor, block the paste-while-focused claim**, keep the hide-window workaround documented. M-3 "0 into SpeakFlow" and M-4 are hard gates; a breach blocks the milestone regardless of other progress.
- **P4:** macOS CI cannot produce an artifact that launches (via the sanctioned Gatekeeper steps) and reaches the transcription path within the milestone's deliberate-run budget → macOS reverts to an explicit non-goal; we ship a Windows-only public v1 **stating that honestly**.
- **Economics:** the mac proof consumes the private-repo Actions quota before landing (C-10 breach) → stop Mac work for the cycle; the falsification above applies.

**Degradation rules (locked):** local failure may hard-block, **never** silently reach the cloud; paste may degrade to clipboard+toast, **never** to a wrong-window keystroke; macOS may degrade to an honest non-goal, **never** to an unlaunchable artifact shipped as "support."

## 4. Success metrics (outcomes, verbatim floors from Intent §3)

| # | Metric | Target | How measured |
|---|--------|--------|--------------|
| M-1 | Zero-manual offline path | Fresh install → speak → corrected text pasted, network disabled, nothing beyond an in-app one-click | Human smoke, clean machine/VM |
| M-2 | Accuracy lift over Fast tier | Selected tier measurably reduces dev-vocab errors vs tiny.en on a fixed spoken script | Fixed 10-utterance dev script, error count per tier |
| M-3 | Paste-while-focused reliability | SpeakFlow window open **and focused** at dictation start → text lands in the user's **prior** target ≥9/10; **0 pastes into SpeakFlow** (hard) | Human smoke (mirror of Quantum Leap G7) |
| M-4 | Invariant #18 preserved | **0** `SetForegroundWindow`/`AttachThreadInput` in the paste path (hard) | CI grep-gate + human observation |
| M-5 | macOS CI artifact | Deliberately-triggered Actions run produces a build that **launches** (sanctioned Gatekeeper steps allowed) and reaches transcription (cloud path minimum) | CI run + human launch smoke |
| M-6 | No Windows regression | All existing gates stay green (typecheck, unit, UI, integration, MCP, G7/G11) | Existing gate matrix, every PR |
| M-7 | Honest README | Public claims regenerated from gate results; "local ✅" only after M-1 passes | DOM review at launch |

## 5. Thin-slice MVP (one end-to-end falsifiable path — Intent §4, unchanged)

On a **fresh Windows install with networking disabled**, the user clicks one in-app control to enable local mode, then — with the **SpeakFlow window open and focused** — speaks a dev sentence, and the corrected text appears in their **previously-focused editor/chat** (not in SpeakFlow), using the **bundled engine** at the **tier they selected**, offline. In parallel, a **macOS artifact from a deliberately-triggered CI run launches** on a Mac and reaches the transcription path. One motion, all four pillars: P1 bundled local, P2 tiers, P3 paste-focus, P4 portability proof.

## 6. Locked decisions (from STORM + WARGAME — the Spec must honor)

| # | Decision | Basis |
|---|---|---|
| L1 | **whisper.cpp stays the engine**; the inference sidecar ships **in the installer** (Invariant #15 closed via the existing bundled-binary mechanism). Parakeet / in-process ONNX is an M7 evaluation, not M6. | STORM a; Wargame B1 #3/#5 |
| L2 | **Hybrid distribution:** smallest usable model ships in the installer (offline out of the box, zero downloads); larger tiers are one-click, SHA-verified downloads. Manual file placement survives only as documented air-gapped fallback — never the primary path. | STORM F1/b (verified peer practice); C-1; Wargame S4/S17 |
| L3 | **Three-tier ladder:** Fast (tiny.en, ~78 MB, shipped) · Balanced (small-class quantized, ~190 MB, recommended default *if the residency spike passes latency*) · Accurate (large-v3-turbo-class quantized, ~574 MB, opt-in with size/RAM guidance). All weights MIT. | STORM F2/a (verified sizes) |
| L4 | **Every model file — bundled or downloaded — passes the existing SHA-256 manifest gate before first use; mismatch/missing → hard-BLOCK + notify.** New release rule: **no unverified hash ever ships** (closes the `TODO(M2-ship)` class permanently; release-blocking). | C-2; Invariant #13; Wargame S2/S3 |
| L5 | **Local failure never silently reaches the cloud.** Hard-block with an actionable message; switching to cloud is an explicit, persisted, off-by-default user action — never a runtime auto-fallback. (OQ-6 resolved: hard-block + explicit opt-in.) | C-7; STORM e; Wargame S1/S13 |
| L6 | **Paste-while-focused fix = yield-focus ladder:** continuously record the last *external* foreground target while listening; if SpeakFlow's own window is focused at capture, **yield** (hide own window — the app only ever gives focus away, activates nothing), settle, then paste **only if** the live foreground now equals the recorded prior target; any mismatch, staleness, or timeout → clipboard+toast. The final own-window check stays as the last gate before any keystroke. (OQ-4 resolved at intent level; timings/mechanism to Spec.) | C-3; Wargame Axis 2 #8, S5–S9; validates Intent A-4 |
| L7 | **M-4 is mechanized:** a CI grep-gate forbids `SetForegroundWindow`/`AttachThreadInput` in the paste path; the pipeline may hide SpeakFlow's window, never show/activate one during inject. | M-4; Wargame S7 |
| L8 | **macOS scope = proof, not parity** (OQ-5 per approved §7): CI build + launch + cloud transcription reached. Native mac paste/hotkey/mic and Linux are M7. | §7 Parity-then-Proof (DOM-approved) |
| L9 | **macOS CI = `workflow_dispatch`/release tags ONLY; never scheduled on push.** Caching (npm/Electron/models) mandated; Windows/Linux gates green *before* any Mac trigger; budget 1–3 deliberate Mac runs/day. The Spec must carry a CI-runner-policy section citing C-10. | C-10/§5b; verified 10.3× billing; Wargame S14 |
| L10 | **Minimum viable mac launch = ad-hoc-signed artifact + documented Gatekeeper steps** (System Settings → Open Anyway, or `xattr`). No Apple Developer account this cycle; notarization is the distribution milestone. The ad-hoc default is **cited-unverified → the first CI spike must validate it** (OQ-8 direction). | STORM F3/d (Sequoia verified); Wargame S10 |
| L11 | **Latency contract for tiers:** a tier above Fast may be *default* only if capture-end→text meets the existing local budget on reference hardware, proven by a Wave-1 residency spike. Batch-spawn-per-utterance remains acceptable for the Fast tier only. Resident-engine lifecycle (idempotent stop, clean shutdown, idle policy) is Spec-owned. (OQ-3 direction.) | STORM F2; Wargame S15 |
| L12 | **No Windows regression by construction:** cross-platform work is additive/branching; the proven win32 surfaces are not refactored this cycle; the full Windows gate matrix runs on every PR (free runners). | C-6; Wargame S11 |
| L13 | **New UI (tier picker, download progress, first-run copy) obeys the component-density invariant; mic-ownership and mute invariants are untouched surfaces.** Honest first-run copy sets local-accuracy expectations (trust, not marketing). | C-8, C-4, C-5; Wargame S12 |
| L14 | **GPU acceleration is OUT this cycle — not a stretch goal** (OQ-7 resolved): CPU-correct first; GPU multiplies the per-config crash matrix (the documented peer failure mode) for zero parity gain. | §6; Wargame S13; STORM F5 |
| L15 | **README honesty pass ships inside the milestone:** every public claim regenerated from gate results; the claims table is part of the launch deliverable, reviewed by DOM (M-7). Repo stays private until DOM's launch sign-off (C-9). | M-7; C-9 |

## 7. Non-goals (explicit deferrals, per approved Intent §6)

- Full macOS/Linux feature parity (native paste/hotkey/mic) → **M7** (macOS first, then Linux — DOM-approved order).
- GPU acceleration (CUDA/Metal/Vulkan) → post-M6 (L14).
- Distribution channels: winget, Homebrew, notarized/signed installers, auto-updater → post-launch milestone.
- Parakeet / non-Whisper engines as default; in-process ONNX consolidation → M7 evaluation (STORM 6th lens).
- Streaming transcription, diarization, meeting/notes surfaces → not this cycle.
- Multi-language correction → English dev vocabulary first (unchanged).

## 8. Deferral order (first-cut-first, if behind)

1. macOS **local** transcription path (cloud-path proof satisfies M-5).
2. Accurate tier (ladder ships Fast + Balanced).
3. Engine residency (Fast-tier default, batch spawn; Balanced stays opt-in with honest latency copy).
4. Tier-picker polish / first-run copy refinement.

**NEVER cut:** engine bundling (P1), per-tier SHA gate + no-unverified-hash rule (L4), M-3/M-4 hard floors, no-silent-cloud (L5), macOS CI discipline (L9), README honesty (L15).

## 9. Open questions (resolve in Spec — Gate D1)

1. Exact quantization variants + measured default tier — decided by the Wave-1 residency/latency spike protocol (reference hardware, pass thresholds).
2. Resident-engine lifecycle contract: process ownership, idempotent stop, shutdown ordering with the existing capture teardown, idle-unload policy.
3. Prior-external-foreground tracker: sampling mechanism (piggyback on the existing poll vs event-driven), staleness window, settle-delay values, and the M-3 smoke protocol timings.
4. macOS CI workflow shape: cache keys, artifact form (dmg/zip), ad-hoc signature validation step, secrets/paths hygiene checklist (C-9), and the written Gatekeeper launch-smoke script.
5. Manifest extension format for per-tier hashes + the release-blocking "no unverified hash" CI check.
6. Disk-space and RAM pre-checks before tier download/selection; download cancel/retry semantics.
7. M-2 measurement protocol: the fixed 10-utterance dev-vocab script and per-tier error-count method.

## 10. Human Gate C1 — STOP

**STOP.** This PRD is at intent altitude. Do not write the Engineering Spec (Opus 4.8, separate session) or any implementation code until DOM approves:

- the problem framing and hypothesis (§1–2),
- the falsification conditions incl. the M-3/M-4 hard floors and the three degradation rules (§3–4),
- the thin-slice MVP (§5),
- **locked decisions L1–L15** — especially L2 (hybrid distribution), L6 (yield-focus ladder), L5 (no silent cloud), L9/L10 (macOS CI discipline + unsigned-launch path),
- the deferral order (§8) and Spec-bound open questions (§9).

`_PRD approved by DOM (Gate C1): YES — 2026-07-08_`
`_Amendments: none_`

**C1 sign-off record (verbatim):** All Gate C1 Q&A YES per Architect recommendations (Q-C1-1…8, L1–L15). Proceed: paste Intent §13B to Opus 4.8.

On approval, paste Intent §13B to **Opus 4.8** in a new session at repo root to produce `M6_PUBLIC_LAUNCH_SPEC.md` (Gate D1).
