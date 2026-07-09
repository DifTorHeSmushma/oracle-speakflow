# STORM Briefing — SpeakFlow Public-Launch Parity 2026

**Topic:** Shipping bundled, multi-tier local Whisper inference and a launchable macOS build for a privacy-first, cross-platform open-source desktop dictation app in 2026 — engine choice, model tiers, bundle-size/accuracy trade-offs, foreground-safe paste on Windows and macOS, and GitHub-Actions macOS packaging economics.
**Reader role:** Solo OSS maintainer preparing a public launch, optimizing for out-of-box reliability and honest claims.
**Slug:** `speakflow-public-launch-parity-2026`
**Date:** 2026-07-08
**Method:** 5 expert-lens research passes (Practitioner, Academic, Skeptic, Economist, Historian) → contradiction map → synthesis → adversarial verification. Commission: `INTENT-m6-public-launch-parity.md` §8.

---

## ✅ Verification banner

**5 / 5 load-bearing (P0-critical) citations independently verified against primary sources this pass; 0 fabricated; remaining lens citations accepted as-cited but not independently re-fetched (flagged `cited-unverified` in References).**

- **VERIFIED** — GitHub Actions billing (docs.github.com): macOS runner **$0.062/min vs Linux $0.006/min (~10.3×)**; private-repo included minutes **Free = 2,000/mo, Pro = 3,000/mo**. Drives C-10/W-9 exactly as the Intent assumed.
- **VERIFIED** — Apple Developer news (developer.apple.com, "Updates to runtime protection in macOS Sequoia"): *"users will no longer be able to Control-click to override Gatekeeper when opening software that isn't signed correctly or notarized. They'll need to visit System Settings > Privacy & Security."* Drives the entire macOS-launch decision (F3, close-the-gap d).
- **VERIFIED** — whisper.cpp model sizes (huggingface.co/ggerganov/whisper.cpp): tiny.en **77.7 MB**, base.en **148 MB**, small.en **488 MB**, medium **1.53 GB**, large-v3 **3.1 GB**, large-v3-turbo **1.62 GB**; quantized: base.en-q5_1 **59.7 MB**, small.en-q5_1 **190 MB**, large-v3-turbo-q5_0 **574 MB**. Drives the tier ladder (close-the-gap a/b).
- **VERIFIED** — Handy README (github.com/cjpais/Handy): models are **downloaded on first run, not bundled in the installer** (manual placement documented only as a restricted-network fallback); tier ladder Small/Medium/Turbo/Large + Parakeet V2/V3 (CPU-optimized, ~5× realtime claim); openly documents *"Whisper models crash on certain system configurations (Windows and Linux)"*; Tauri; MIT.
- **VERIFIED** — OpenWhispr README (github.com/OpenWhispr/openwhispr): **Electron 41**, whisper.cpp + Parakeet-via-sherpa-onnx, model weights fetched from Hugging Face, macOS/Windows/Linux targets, MIT.

---

## 60-second summary

The parity gap is **distribution, not technology** — SpeakFlow already has the sidecar wiring, the SHA-256 integrity gate, and a model downloader; what it lacks is a bundled engine, more than one model tier, and honesty about it. The verified market pattern settles the biggest open question: **nobody ships model weights inside the installer** — every credible peer bundles the *engine* and fetches models on first run from Hugging Face. Invariant #15's letter (binaries bundled) and C-1's allowance (one-click model acquisition) are therefore perfectly compatible: **ship `whisper-cli` + the smallest usable model in the installer, download larger tiers one-click behind the existing SHA gate.**

The two hard truths this briefing lands: (1) **quantized models change the tier economics** — small.en-q5_1 at 190 MB and large-v3-turbo-q5_0 at 574 MB make a genuine accuracy ladder shippable, but the current **per-utterance `spawnSync` reloads the model on every cycle**, which caps any tier above tiny at unacceptable latency — process/model residency is load-bearing for P2, not polish. (2) **macOS Sequoia removed the Control-click Gatekeeper bypass** — an unsigned CI artifact will *not* double-click-launch; the milestone's mac proof is still achievable without an Apple Developer account, but only via ad-hoc signing plus documented System Settings "Open Anyway" (or `xattr`) tester steps. Meanwhile the verified 10.3× macOS billing multiplier confirms C-10's arithmetic to the cent.

---

## 5 ranked findings

### F1 — The sanctioned bundling pattern is "engine in installer, models one-click" — no peer ships weights in the installer. `confidence 9/10`
- **Supported-by:** Practitioner (Handy **verified**: download-on-first-run, manual placement only as restricted-network fallback; OpenWhispr **verified**: HF-hosted weights), Economist (installer bloat → abandonment; HF hosts the bandwidth bill), repo ground truth (`extraResources` mechanism already bundles ffmpeg.exe; downloader + SHA verify already exist for tiny.en).
- **Challenged-by:** the Intent's thin-slice ("networking disabled") — resolved by the hybrid: ship the smallest tier **in** the installer so a fresh install transcribes offline with zero downloads; larger tiers are the one-click path.
- **Consequence:** P1 closes with almost no new machinery: add `whisper-cli.exe` (+ its ggml DLLs) to the existing `extraResources` flow, ship tiny.en in-box, extend the existing downloader + `models.sha256` manifest to a tier ladder. The false README claim dies the same day.

### F2 — Quantized tiers make the accuracy ladder shippable, but per-utterance `spawnSync` makes it unusable above tiny — model residency is load-bearing. `confidence 8/10`
- **Supported-by:** Academic (verified sizes: 59.7/190/574 MB quantized vs 148/488/1620 MB full; q5 quantization degrades WER only marginally — cited-unverified magnitude), repo ground truth (`transcribeLocal` spawns per utterance, cold process + full model load every cycle; a 574 MB load per sentence is seconds, violating the <800 ms local budget), Practitioner (Handy/OpenWhispr keep engines resident).
- **Challenged-by:** Skeptic — a persistent sidecar is a new lifecycle surface (zombies, memory residency, idempotent shutdown per Invariant #8). Accepted: that is Spec work, not a reason to stay tiny-only.
- **Consequence:** The tier ladder (close-the-gap a) is **tiny.en 77.7 MB (Fast, shipped) / small.en-q5_1 190 MB (Balanced, recommended default) / large-v3-turbo-q5_0 574 MB (Accurate, opt-in)** — all Whisper weights MIT. A tier above Fast may only become the *default* if a residency spike proves the latency budget; batch-spawn stays acceptable for Fast only.

### F3 — An unsigned macOS CI artifact will NOT double-click-launch on Sequoia; the minimum viable path is ad-hoc signing + documented "Open Anyway" steps — no $99 account needed this cycle. `confidence 9/10`
- **Supported-by:** Skeptic (**verified Apple primary source**: Control-click bypass removed; System Settings → Privacy & Security → Open Anyway, once per app), Practitioner (Apple silicon refuses entirely-unsigned arm64 binaries; electron-builder falls back to ad-hoc signatures when no identity is configured — cited-unverified, **must be validated in the Spec's first CI spike**), Economist (notarization = $99/yr + workflow; wrong milestone for it).
- **Challenged-by:** none material. `xattr -cr` clearing the quarantine attribute remains a tester-side alternative for downloaded artifacts.
- **Consequence:** M-5 ("launches") is achievable and honest **if and only if** the launch smoke script includes the Gatekeeper steps. Notarization/signing-for-strangers is explicitly the distribution milestone, not M6 (close-the-gap d).

### F4 — macOS CI economics are exactly as the Intent priced them: ~290 Mac-equivalent minutes/month on Pro — C-10 is arithmetic, not caution. `confidence 10/10`
- **Supported-by:** Economist (**verified**: $0.062 vs $0.006/min ≈ 10.3×; Pro = 3,000 private min/mo ⇒ ≈ 290 Mac minutes ⇒ ~25–35 package jobs at 8–12 min each). One agentic on-push loop = quota gone in an afternoon.
- **Challenged-by:** none.
- **Consequence:** `workflow_dispatch`/release-tags only; `actions/cache` for npm + Electron + models so each deliberate run is not a cold-download tax; Windows/Linux gates run freely and must be green *before* any Mac trigger (W-9 mitigation, verbatim into PRD/Spec).

### F5 — Per-config local-inference crashes are the documented reality, not a tail risk; the answer is hard-block + guidance, never silent cloud. `confidence 8/10`
- **Supported-by:** Skeptic (Handy README **verified**: openly admits Whisper crashes on certain Windows/Linux configs; whisper.cpp issue tracker shows silent Windows crashes, e.g. #2652/#2175 — cited-unverified content; older CPUs without AVX are a known crash class — cited-unverified), repo ground truth (`localTranscriptionFailed` classification already exists).
- **Challenged-by:** Practitioner steelman "don't bundle, stay cloud" — rejected: out-of-box offline is the #1 parity axis and the privacy differentiator; the steelman survives only as *consented* cloud fallback.
- **Consequence:** Local failure surfaces an actionable hard-block (what failed, what to try, offer tier change or consented cloud switch). **Silent cloud fallback is forbidden** (C-7): switching to cloud is an explicit, persisted user action, off by default (close-the-gap e). Historian's footnote: tools died from maintenance burden and trust erosion, not from missing features — Dragon rotted, Talon survived on community trust; honest failure modes are the survival trait.

---

## A2 — Contradiction map

1. **Direct conflicts:**
   - *Invariant #15 "bundle everything" (spirit)* vs *Practitioner "no peer ships weights in-installer."* → **Resolved by C-1's own text:** binaries bundled (engine in `extraResources`); models are one-click acquisitions; hybrid ships the smallest tier in-box so the offline thin-slice holds with zero downloads.
   - *Academic "bigger model = fewer dev-vocab errors"* vs *repo latency budget + per-utterance `spawnSync`.* → **Resolved by residency:** the contradiction is real only while the model reloads per utterance; a resident engine dissolves it (F2). Default-tier promotion is gated on a latency spike.
   - *Skeptic "unsigned Mac builds can't run on Sequoia"* vs *Economist "notarization is not this cycle."* → **Resolved by the middle path:** ad-hoc signature + documented Open Anyway/xattr steps = launchable proof without the Apple Developer tax (F3).
2. **Strongest vs weakest evidence:** Strongest = GitHub billing page, Apple Sequoia announcement, HF file listings (all primary, verified). Weakest = quantization WER-degradation magnitudes and CPU RTF figures for q5 tiers on mid-range hardware — directionally solid, magnitudes machine-dependent; demoted to spike-validated.
3. **Single resolving empirical question:** *Does a resident whisper.cpp process at small.en-q5_1 meet the capture-end→text budget (<800 ms local) for a typical dictated dev sentence on DOM's reference CPU?* — This is the falsifiable core of P2 and must be the Spec's Wave-1 spike gate.
4. **Universal agreement (load-bearing truth):** Out-of-box offline is table stakes; model files are commodity downloads behind integrity gates; never fight Gatekeeper or the foreground policy — use the sanctioned path; macOS CI minutes are scarce and must be spent deliberately.
5. **Blind spot → 6th lens:** every lens treated local inference as an **external sidecar process**. Unexamined alternative: the repo *already bundles `onnxruntime-node`* for Silero VAD — in-process ONNX inference (whisper-onnx / sherpa-onnx node bindings) would eliminate the spawn tax, the sidecar lifecycle, and the per-platform binary matrix entirely. → **6th-lens candidate: "The Runtime Engineer."** Out of scope for M6 (whisper.cpp is proven in-repo); first-class evaluation candidate for M7 alongside Parakeet.

---

## Hidden connection

P1 (bundling) and P3 (paste-while-focused) are the **same failure archetype the Quantum Leap already named: fighting a system's defaults instead of using the sanctioned path.** The README fought reality by claiming a feature the packaging didn't deliver; the paste gap persists because restoring focus *to* a prior window looks like it needs the forbidden `SetForegroundWindow`. Both resolve the same way: use the mechanism the platform already sanctions — `extraResources` for binaries, one-click verified downloads for models, and **yielding SpeakFlow's own focus** (hiding its own window, which Windows answers by re-activating the prior window — no foreground theft) for paste. Same principle, third milestone in a row: constrain to the sanctioned path.

---

## Missing 6th lens / key assumption

**Key assumption to flag:** all lenses assumed the local engine stays an external process. The in-process ONNX path (Runtime Engineer lens) — already half-bundled via `onnxruntime-node` — could delete the sidecar entirely and is the strongest long-term simplification. Second flagged assumption: **electron-builder's ad-hoc signing default on arm64 is cited-unverified** — the Spec's first macOS CI spike must confirm the artifact carries an ad-hoc signature and launches via Open Anyway before any wave is declared green (A-5/OQ-8).

---

## Close-the-gap outputs (mandated by Intent §8)

| # | Question | Finding |
|---|----------|---------|
| **(a)** | Engine + tier ladder | **Keep whisper.cpp** (`whisper-cli` sidecar — proven in-repo, MIT, peer-standard). Ladder: **Fast = tiny.en 77.7 MB (shipped in installer) · Balanced = small.en-q5_1 190 MB (recommended default, spike-gated) · Accurate = large-v3-turbo-q5_0 574 MB (opt-in)**. All weights MIT. Parakeet/sherpa-onnx: genuinely attractive (CPU ~5× realtime per Handy) but a second engine + runtime = M7 evaluation, not M6. |
| **(b)** | Ship-in-installer vs one-click | **Hybrid.** Engine + Fast tier in installer (~+90 MB on today's Electron installer — lands ~200 MB territory, within peer norms); Balanced/Accurate one-click behind the existing SHA-256 manifest gate. Pure download-only fails the networking-disabled thin slice; pure bundle-everything (+2.3 GB) is abandonment-grade. |
| **(c)** | macOS paste/injection | Sanctioned mac path is CGEvent/Accessibility-API injection with user-granted Accessibility permission — **out of scope this cycle** per approved Parity-then-Proof (§7). M6 mac proof = build + launch + cloud transcription reachable. Native paste/hotkey/mic = M7. |
| **(d)** | Can an unsigned CI mac build launch? | **Not by double-click on Sequoia** (verified: Control-click bypass removed). Minimum viable: **ad-hoc signature (electron-builder default — validate in spike) + documented System Settings → Open Anyway (or `xattr -cr`) tester steps.** No Apple Developer account required for M6. Notarization = distribution milestone. |
| **(e)** | Local-fail → cloud stance | **Hard-block + notify, never silent.** Cloud fallback only via explicit, persisted, off-by-default user consent (a deliberate settings action, not a runtime prompt racing a failure). Matches C-7 and global hard-block-gates law. |

---

## Actionable moves for M6

1. **Bundle `whisper-cli.exe` + runtime DLLs via the existing `extraResources` mechanism; ship tiny.en in-box.** Delete "place the binary in resources/bin" from the user-facing path (keep as air-gapped fallback doc only). P1 dies.
2. **Extend the existing downloader + `models.sha256` manifest to the three-tier ladder** — per-tier verified hashes authored at Spec time (close the `TODO(M2-ship)` class permanently: no unverified hash ships, ever).
3. **Spike model residency before locking the default tier:** resident engine, warm small.en-q5_1, measure capture-end→text on reference hardware. Pass → Balanced default; fail → Fast default, Balanced stays opt-in.
4. **Paste-while-focused = yield-focus ladder:** continuously record the last *external* foreground window while listening (the existing 1 s poll can carry this); when SpeakFlow is focused at capture, hide own window → settle → verify foreground now equals the recorded prior target → paste; any mismatch → clipboard+toast. Zero `SetForegroundWindow`. Add a CI grep-gate for the forbidden APIs (M-4).
5. **macOS: one `workflow_dispatch` packaging workflow** with npm/Electron/model caching, ad-hoc-signed dmg/zip artifact, and a written launch-smoke script that includes the Gatekeeper steps. Trigger deliberately, 1–3/day max (C-10).
6. **README honesty pass ships in the same milestone** — claims table regenerated from what actually passed M-1…M-5.

---

## Claim safety guide

- **Assert freely:** "macOS CI minutes bill at ~10× Linux; Pro gives 3,000 private minutes" (verified). "Sequoia removed the Control-click Gatekeeper bypass; unsigned apps need Open Anyway" (verified, Apple primary). "Quantized small/turbo tiers are 190/574 MB" (verified). "Peers download models on first run rather than bundling" (verified, Handy).
- **Caveat:** "small.en-q5_1 meets the latency budget" → *machine-dependent; spike-gated.* "electron-builder ad-hoc signs by default on arm64" → *cited-unverified; validate in first CI spike.* "q5 quantization costs ~negligible WER" → *directionally supported, magnitude unmeasured on dev speech.*
- **Avoid:** claiming the mac artifact "just launches" without Gatekeeper steps; claiming any tier ladder benefit while `spawnSync` reloads per utterance; publishing "local ✅" before M-1 passes on a clean machine; quoting Parakeet RTF marketing numbers as if measured in this codebase.

---

## Frontier question

Can SpeakFlow eliminate the sidecar entirely — running Whisper-class inference **in-process through the already-bundled ONNX runtime** (sherpa-onnx / whisper-onnx), erasing the spawn tax, the per-platform binary matrix, and the sidecar lifecycle in one move — and does that beat adopting Parakeet as a second engine? (The Runtime Engineer 6th-lens investigation; M7.)

---

## References (with verification status)

| # | Claim it supports | URL | Status |
|---|---|---|---|
| R1 | macOS $0.062/min vs Linux $0.006/min; Free 2,000 / Pro 3,000 private min/mo | https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions | **verified 2026-07-08** |
| R2 | Sequoia removes Control-click Gatekeeper override; System Settings path | https://developer.apple.com/news/?id=saqachfa | **verified 2026-07-08** |
| R3 | ggml model + quantized sizes (77.7 MB … 3.1 GB) | https://huggingface.co/ggerganov/whisper.cpp/tree/main | **verified 2026-07-08** |
| R4 | Handy: download-on-first-run, tier ladder, Parakeet, documented Whisper crashes, Tauri, MIT | https://github.com/cjpais/Handy | **verified 2026-07-08** |
| R5 | OpenWhispr: Electron 41, whisper.cpp + sherpa-onnx, HF-hosted weights, MIT | https://github.com/OpenWhispr/openwhispr | **verified 2026-07-08** |
| R6 | whisper.cpp silent crash on some Windows configs | https://github.com/ggml-org/whisper.cpp/issues/2652 | cited-unverified |
| R7 | whisper.cpp silent crash (second class) | https://github.com/ggml-org/whisper.cpp/issues/2175 | cited-unverified |
| R8 | Sequoia Gatekeeper secondary coverage (Open Anyway flow) | https://appleinsider.com/articles/24/08/06/apple-removes-control-click-option-for-skipping-gatekeeper-in-macos-sequoia | cited-unverified |
| R9 | Whisper model weights MIT-licensed | https://github.com/openai/whisper | cited-unverified |
| R10 | Parakeet TDT 0.6B v2 model card (license/CPU claims) | https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2 | cited-unverified |
| R11 | electron-builder macOS signing behavior (ad-hoc fallback) | https://www.electron.build/code-signing | cited-unverified — **Spec spike must validate** |
| R12 | Apple notarization requirements ($99/yr developer program) | https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution | cited-unverified |
| R13 | VoiceInk (macOS, GPL v3, whisper.cpp + Parakeet) | https://github.com/Beingpax/VoiceInk | cited-unverified |
