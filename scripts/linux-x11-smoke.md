# Linux X11 Smoke Protocol — G32 / G33
**Wave 7e · Oracle SpeakFlow M7b Linux Parity**

Hard floors: ≥8/10 hands-free auto-paste (Part A) · 0 wrong-target paste (all parts) · guard probes produce 0 keystrokes (Part B)

---

## Setup

1. Boot a **fresh Ubuntu 24.04** install (VM or bare metal).
2. At the GDM login screen: click the gear icon next to the password field and select **"Ubuntu on Xorg"**.
3. Log in. Verify the session:
   ```bash
   echo $XDG_SESSION_TYPE   # must print: x11
   ```
   If it prints `wayland`, log out and repeat step 2.

4. Install the CI artifact:
   ```bash
   sudo apt install ./Oracle-SpeakFlow-*.deb
   ```
   Record the full install log (apt resolves `ffmpeg` + `x11-utils` automatically — this proves LD9).

5. Launch from the applications menu (packaged path only — no `npm start` or dev mode).
6. Verify the tray icon appears. Open Settings → Voice tab: confirm **no** PTT-unavailable notice (session is x11, so PTT should be available).

---

## Part A — Hands-free auto-paste (10 utterances, primary gate)

**Target apps:** Cursor IDE (chat field or editor) and GNOME Terminal prompt.
Focus the target **before** speaking. Do not click SpeakFlow's window.

For each utterance, record:
- Utterance # and short dictated phrase (≥4 words)
- Target app (Cursor / GNOME Terminal)
- Where text appeared: **target field** (pass) / **wrong target** / **clipboard only** / **nothing**
- Latency estimate (fast / medium / slow)

| # | Phrase | Target | Result | Notes |
|---|--------|--------|--------|-------|
| 1 | | Cursor | | |
| 2 | | Cursor | | |
| 3 | | Cursor | | |
| 4 | | Cursor | | |
| 5 | | Cursor | | |
| 6 | | GNOME Terminal | | |
| 7 | | GNOME Terminal | | |
| 8 | | GNOME Terminal | | |
| 9 | | GNOME Terminal | | |
| 10 | | GNOME Terminal | | |

**Pass criteria:** ≥8/10 utterances auto-paste corrected text into the focused field.
**Hard floor:** 0 wrong-target pastes. Any wrong-target = hard-floor breach, Linux release blocked outright.

GNOME Terminal utterances specifically verify the **Ctrl+Shift+V** chord (terminal executor branch).

---

## Part B — Guard probes (2 probes, must produce 0 keystrokes)

### Probe B1 — Own-window focused at dictation start
1. Click SpeakFlow's tray window so SpeakFlow has focus.
2. Begin speaking (hands-free will capture).
3. Wait for the full pipeline to complete.
4. **Expected:** transcript appears on clipboard + toast notification. Zero text injected into SpeakFlow's own window. Zero keystrokes to any other app.

Record: result (clipboard+toast / unexpected keystroke), where focus landed.

| Probe | Result | Focus after pipeline | Any keystroke? |
|-------|--------|---------------------|----------------|
| B1 Own-window | | | |

### Probe B2 — Alt-tab mid-utterance
1. Focus Cursor (or any text field).
2. Start speaking.
3. While speaking, press Alt+Tab to switch to a different app (e.g., Files, Settings).
4. Release Alt+Tab. Let the pipeline complete.
5. **Expected:** clipboard+toast; text does NOT appear in either app; zero keystrokes.

Record: result, where clipboard text went (if anywhere).

| Probe | Result | Clipboard has transcript? | Any keystroke? |
|-------|--------|--------------------------|----------------|
| B2 Alt-tab | | | |

**Hard floor:** any keystroke from either guard probe = breach, Linux release blocked.

---

## Part C — PTT backup (5 utterances)

**Hotkey:** default Ctrl+Shift+R (or the configured hotkey shown in Settings → Voice → Hotkey).

For each utterance: hold the hotkey, speak the phrase, release. Target must be focused before pressing.

| # | Phrase | Target | Result | Notes |
|---|--------|--------|--------|-------|
| 1 | | Cursor | | |
| 2 | | Cursor | | |
| 3 | | Cursor | | |
| 4 | | GNOME Terminal | | |
| 5 | | GNOME Terminal | | |

**Pass criteria:** ≥4/5 auto-paste, 0 wrong-target.
**Deferral rule:** PTT flaky but hands-free (Part A) green → PTT row scoped down (deferral #2), milestone continues.

---

## Triage on silence / no paste

If audio is not captured or VAD does not trigger:

```bash
# List available sources
pactl list sources short

# Check the default source
pactl get-default-source

# Set a specific source (if default is wrong)
pactl set-default-source <source-name>

# Or launch with an explicit override
SPEAKFLOW_PULSE_AUDIO=<source-name> oracle-speakflow

# Enable VAD debug (RMS telemetry on stderr — useful to verify mic input)
SPEAKFLOW_VAD_DEBUG=1 oracle-speakflow 2>&1 | grep -i rms
```

---

## Session proof + artifact provenance

Before filing the gate record, capture:

```bash
echo $XDG_SESSION_TYPE         # must be: x11
echo $XDG_SESSION_DESKTOP      # expect: ubuntu or gnome
lsb_release -a                 # Ubuntu version
dpkg -l oracle-speakflow        # installed version
```

---

## Gate record template

File the following in the wave STOP report:

```
Gate: G32 (G33 if this is the second claimed row)
Date:
Tester:
Machine: Ubuntu [version], [X11/Xorg], [VM/bare metal]

Session proof: XDG_SESSION_TYPE=x11

Install log: [paste or attach]

Part A — 10 utterances:
  Cursor passes:       /5  (wrong-target: 0)
  GNOME Terminal:      /5  (wrong-target: 0)
  Total:               /10
  PASS / FAIL

Part B — guard probes:
  B1 own-window:       clipboard+toast [yes/no]  keystroke [0/n]
  B2 alt-tab:          clipboard+toast [yes/no]  keystroke [0/n]
  PASS / FAIL

Part C — PTT (5 utterances):
  Cursor passes:       /3
  GNOME Terminal:      /2
  Total:               /5
  PASS / FAIL / SCOPED-DOWN

Overall G32 verdict: PASS / FAIL
Notes:
```

---

## Ubuntu 22.04 (optional second run — G33)

Repeat the full protocol on Ubuntu 22.04 X11 **only if** the 22.04 row will be claimed in the README.
Use the same artifact (deb). Record a separate gate entry with `Gate: G33` and `Machine: Ubuntu 22.04`.
If 22.04 smoke is not run, the 22.04 README row is **omitted** (honest row rule, LD16).
