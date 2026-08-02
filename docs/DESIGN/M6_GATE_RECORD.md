# M6 Public-Launch Parity — Gate Record

**Date:** 2026-07-09  
**Authority:** `M6_PUBLIC_LAUNCH_PRD.md` (C1), `M6_PUBLIC_LAUNCH_SPEC.md` (D1)  
**Reference hardware:** DOM dev machine — Windows 11, ASUS TUF A15, Ryzen 7 4800H, 16 GB RAM  
**Code commits (main):**

| SHA | Description |
|-----|-------------|
| `b9d9584` | Waves 1.1–2: local engine, tier IPC, S2/G21 hotfix, whisper-cli `--output-file` fix |
| `fde19dd` | Wave 3: yield-focus inject ladder, G19 `check:focus`, TierPicker UI |

**Installer of record (Windows smoke):** `dist-installer/Oracle SpeakFlow Setup 0.1.0.exe` — built 2026-07-09 ~15:24 (Wave 3)

---

## 1. Executive summary

| Pillar | PRD | Status |
|--------|-----|--------|
| **P1** Bundled local offline | M-1 / G21 | ✅ **PASS** — fresh install, flight mode, speak → paste (Fast tier) |
| **P2** Three-tier ladder | G14–G17 | ✅ **CODE COMPLETE** — registry, downloader, TierPicker; Fast bundled |
| **P3** Paste-while-focused | M-3 / G18 | ❌ **FAIL** → **PRD §3 P3 downgrade** (clipboard floor) |
| **P4** macOS portability proof | M-5 / G23 | ✅ **PASS (Path A)** — Mac Package + G23-runner on cloud Mac (2026-07-09); human mic Path B optional |

**M6 realistic outcome (Spec §9b):** Bundled Fast offline + tier ladder + yield-focus **safety floor** + mac CI proof. Resident Balanced-default and paste-while-focused **deferred per falsification paths** — not milestone blockers when documented honestly.

---

## 2. Gate matrix (G13–G26)

| Gate | Type | Metric | Result | Evidence / notes |
|------|------|--------|--------|------------------|
| **G13** | human+auto | Engine pre-flight in packaged build | ✅ PASS | S1-M6 spike C1/C3/C4; packaged `resources/bin/whisper-cli.exe` + `ggml-tiny.en.bin` |
| **G14** | auto | Manifest integrity | ✅ PASS | `npm run check:manifest` |
| **G15** | auto | Downloader SHA, cancel, disk | ✅ PASS | `modelDownloader.test.ts` |
| **G16** | auto | Tier resolution + SHA | ✅ PASS | `modelRegistry.test.ts` |
| **G17** | auto | Resident engine lifecycle (mocked) | ✅ PASS | `localEngine.test.ts`; Fast uses batch path (S1 C2 residency FAIL → Fast-default DOM decision) |
| **G18** | **human** | M-3 paste-while-focused ≥9/10 | ❌ **FAIL** | SpeakFlow focused → 0/N into prior Notepad; Notepad focused → paste works. See §3. |
| **G19** | auto | No SetForegroundWindow in paste path | ✅ PASS | `npm run check:focus` |
| **G20** | auto | Yield pure logic | ✅ PASS | `yieldFocus.test.ts`, `foregroundTracker.test.ts`, `paste.test.ts` |
| **G21** | **human** | M-1 offline local paste | ✅ **SIGNED** | 2026-07-09: online + offline (flight mode) paste into Notepad; `transcript-history.json` local entries |
| **G22** | human | M-2 dev-vocab accuracy per tier | ⏸️ PENDING | Script: `M6_M2_DEV_VOCAB_SCRIPT.md` (to author in launch polish) |
| **G23** | auto+artifact | M-5 macOS CI build + G23-runner bundle verify | ✅ PASS | 2026-07-09: Mac Package workflow green; G23-runner on cloud Mac; human Path B N/A (no Mac HITL required for proof) |
| **G24** | auto | No macos on push/PR | ✅ PASS | `npm run check:workflows` + `mac-package.yml` dispatch/tags only |
| **G25** | auto | Windows (+ Ubuntu) regression CI | ✅ PASS | `.github/workflows/ci.yml` on push/PR |
| **G26** | auto | migrateConfigV4 | ✅ PASS | `config-migration.test.ts` |

**Automated counts at gate record (local):** `npm test` 220/220 · `npm run test:ui` 50/50 · typecheck 0 errors

---

## 3. G18 failure — PRD §3 P3 downgrade (authoritative)

### Observed behavior (DOM, 2026-07-09)

1. Notepad open → SpeakFlow tray window focused → speak → **no paste in Notepad** (waveform active).
2. Click Notepad → speak → **paste works** (G21 path).
3. Occasional **Fast-tier hallucination** on mumble/silence (e.g. `[BLANK_AUDIO]`, repetitive garbage) — **M-2 / tier issue**, not paste routing.

### P3 falsification applied

Per PRD §3 P3 and Spec Wave 3:

> If the ladder can't hit M-3 → **revert to clipboard+toast floor**, **block the paste-while-focused claim**, keep hide-window / click-target workaround documented.

| Requirement | Disposition |
|-------------|-------------|
| M-3 ≥9/10 focused → prior target | ❌ Not met — **claim blocked** |
| M-4 zero foreground steal | ✅ G19 PASS — yield uses `win.hide()` only |
| 0 pastes into SpeakFlow | ✅ No evidence of text landing in SpeakFlow fields during smokes |
| Wrong-window keystroke | ✅ No evidence — floor prevents keystroke on mismatch |

**Wave 3 code ships** (G19/G20). **G18 human sign-off: NOT GRANTED.** No Wave 3.1 patch loop — floor is the designed degradation.

---

## 4. S1-M6 residency spike (Wave 1.0 reference)

| Probe | Result |
|-------|--------|
| C1 dev + packaged binary | PASS |
| C2 resident latency p95 ≤800 ms | **FAIL** (p95 ≈5213 ms) |
| C3 idempotent kill | PASS |
| C4 stderr-only | PASS |

**DOM decision:** Option 1 — **Fast-default / batch** (`whisper-cli` per utterance). Balanced/Accurate opt-in with honest latency copy.

---

## 5. M-7 claims table (README / launch — regenerate at polish)

| Public claim | Allowed? | Gate basis |
|--------------|----------|------------|
| Local transcription works offline (Fast tier) | ✅ **YES** | G21 |
| Engine + Fast model bundled; no manual binary step | ✅ **YES** | G13, G21, Invariant #15 |
| Three-tier model ladder (download larger tiers) | ✅ **YES** | G14–G16, TierPicker |
| Paste into focused external app (Notepad, chat, IDE) | ✅ **YES** | G21 when target focused |
| Paste while SpeakFlow window is focused | ❌ **NO** | G18 FAIL — workaround: click target first; clipboard fallback |
| Balanced recommended default | ❌ **NO** | S1 C2 FAIL — **Fast is default** |
| Resident engine low latency (Balanced+) | ⚠️ **Opt-in honest copy** | Spike failed; downloads available |
| macOS support | ✅ **Beta / proof** | G23 Path A (cloud Mac package + G23-runner) — not full Windows parity; human Path B optional |
| Cloud fallback on local failure | ❌ **NO** | L5 — hard-block, never silent cloud |
| GPU acceleration | ❌ **NO** | L14 out of scope |

---

## 6. Known issues (documented, not patch-track)

| Issue | Designed response |
|-------|-------------------|
| Fast tier accuracy / hallucination on unclear speech | M-2 (G22) + Balanced tier opt-in; first-run honesty copy |
| SpeakFlow-focused paste | P3 clipboard floor; README workaround |
| TierPicker "Recommended" on Balanced | **Fix in launch polish** → badge Fast as bundled default |
| `whisper-cli` v1.9 `--output-dir` removed | Fixed `b9d9584` (`--output-file`) |

---

## 7. Remaining milestone work (in order)

| Phase | Owner | Deliverable |
|-------|-------|-------------|
| **Wave 4** | — | ✅ Done — `ci.yml`, `mac-package.yml`, `check-workflows.mjs`, `mac-launch-smoke.md` |
| **G23 Path A** | Actions | ✅ Done — cloud Mac Package + G23-runner (2026-07-09) |
| **Linux package factory** | Actions | ✅ Done — `linux-package.yml` G28/G31 (e.g. 2026-07-17); desktop G32 still open |
| **Launch polish** | DOM | README honesty + OSS preflight; CHANGELOG / G22 optional |
| **G22** | DOM | M-2 scripted accuracy compare (optional) |
| **Public launch** | DOM | Flip repo visibility after OSS preflight approval |

---

## 8. Sign-off block

```
Gate record authored: 2026-07-09
Amended:              2026-08-02 (OSS preflight — G23/G24/G25 + Linux factory)
G21 (M-1):  SIGNED — DOM
G18 (M-3):  FAIL — P3 downgrade applied
G19 (M-4):  PASS — automated
G23 Path A: PASS — Mac Package + G23-runner (cloud Mac, 2026-07-09)
G24/G25:    PASS — check:workflows + ci.yml
Wave 4:     COMPLETE
Wave 3.1:   NOT AUTHORIZED — per PRD falsification
Linux G32:  OPEN — human X11 smoke before supported claim
```
