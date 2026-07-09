# G23 — macOS Launch Smoke Protocol (DOM procedure)

**Gate:** G23 (M-5 macOS portability proof)  
**Authority:** M6_PUBLIC_LAUNCH_SPEC §0 Q4, §8 G23  
**Runner:** DOM on personal macOS machine **OR** automated **G23-runner** step in `mac-package.yml` (cloud Mac — no physical Mac required)

---

## Path A — No physical Mac (free tier, recommended for DOM)

When you have **no Mac access**, the macOS build still runs on **GitHub's cloud `macos-latest` runner**:

1. GitHub → **Actions** → **Mac Package** → **Run workflow** (branch `main`).
2. Wait for green. The workflow step **G23-runner** verifies on the cloud Mac:
   - `.app` bundle exists
   - Mach-O binary present
   - ad-hoc `codesign`
   - `xattr -cr` (Gatekeeper prep)
3. Download artifacts: **oracle-speakflow-mac-dmg** and **oracle-speakflow-mac-zip**.

Record in `M6_GATE_RECORD.md`:

```
| G23 | auto+artifact | M-5 macOS CI build + G23-runner bundle verify | ✅ PASS | <date>: Mac Package workflow green; G23-runner on cloud Mac; human launch N/A (no Mac access) |
```

This satisfies **M-5 build proof** per PRD L8 (macOS = proof not parity). Human mic/UI smoke is optional when a Mac becomes available.

---

## Path B — Physical Mac (optional human smoke)

**Target:** cloud transcription path (Fast tier not expected; whisper binaries are Windows-only)

---

## Prerequisites (Path B only)

- A successful `mac-package.yml` run via **workflow_dispatch** (GitHub → Actions → Mac Package → Run workflow)
- A macOS machine (Sequoia / Ventura / Sonnet or later)
- A valid `GROQ_API_KEY` for cloud transcription

---

## Step 1 — Download artifact

1. Go to the completed `mac-package.yml` workflow run on GitHub Actions.
2. Download the **oracle-speakflow-mac-zip** artifact (the ZIP, not the DMG — ZIP is the reliable Gatekeeper-smoke vehicle).
3. Double-click the `.zip` to expand it → produces `Oracle SpeakFlow.app` (or `Oracle SpeakFlow-<version>-arm64.app`).

---

## Step 2 — Clear quarantine attribute

Sequoia removed the Control-click "Open" bypass. Use one of the following (in order of preference):

**Option A — Terminal (recommended, reliable on all Sequoia versions):**
```bash
xattr -cr "/path/to/Oracle SpeakFlow.app"
```
Then double-click the `.app` to launch.

**Option B — System Settings (GUI, first-launch only):**
1. Double-click the `.app` → Gatekeeper blocks it → click OK/Cancel on the dialog.
2. Open **System Settings → Privacy & Security**.
3. Scroll down to the "Security" section → find `"Oracle SpeakFlow" was blocked...` → click **Open Anyway**.
4. Confirm in the second dialog.

> **Note:** On Sequoia, the old "Right-click → Open" bypass no longer bypasses Gatekeeper for unsigned apps. Use Option A or Option B only.

---

## Step 3 — Configure and smoke

1. Launch the app (tray icon should appear in the menu bar).
2. Open the settings/API key panel.
3. Enter a valid `GROQ_API_KEY`.
4. Press the hotkey (default: Ctrl+Shift+R, or whatever is configured) and speak a short phrase.
5. Verify: transcript text lands in the clipboard or a focused text field via cloud (Groq) path.

**Minimum pass bar:** app launches, reaches cloud transcription, produces text output at least once. Local whisper is not expected (binaries are Windows-only; the bundle ships empty `resources/bin`).

---

## Step 4 — Record result

Screenshot the running app + the Gatekeeper step used. Log the result in `docs/DESIGN/M6_GATE_RECORD.md` under G23:

```
| G23 | human | M-5 Mac launch + cloud transcribe | ✅ PASS | <date>: <macOS version>, <Gatekeeper method>, cloud transcribe confirmed |
```

---

## Known limitations (proof not parity)

| Limitation | Disposition |
|------------|-------------|
| No local whisper on macOS | Expected — whisper binaries are Windows-only (Wave 4 ships CI proof only) |
| Ad-hoc signature (identity: null) | Requires quarantine-clear step (Option A or B above) |
| No Gatekeeper notarization | Out of scope until M-8 (cross-platform parity) |
| Sequoia Control-click bypass removed | Documented — use Option A or B |
