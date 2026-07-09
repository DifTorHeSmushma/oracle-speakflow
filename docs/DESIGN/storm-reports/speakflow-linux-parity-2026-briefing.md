# STORM Briefing — SpeakFlow Linux Parity 2026

**Topic:** Native paste, capture, global hotkeys, and Electron packaging for Linux desktop dictation (X11 + Wayland) in 2026 — Handy/OpenWhispr failure modes, nut-js vs xdotool vs wtype, PulseAudio/PipeWire FFmpeg, AppImage vs deb, ubuntu-latest CI economics.
**Reader role:** Solo OSS maintainer (Windows dev box, no local Linux desktop) shipping a credible third platform without breaking two proven ones.
**Slug:** `speakflow-linux-parity-2026`
**Date:** 2026-07-09
**Method:** 6 expert-lens research passes (X11 Practitioner, Wayland Skeptic, Audio Engineer, Packager, CI Economist, Competitor Historian) → contradiction map → synthesis → adversarial verification. Commission: `INTENT-m7b-linux-parity.md` §7 / `FABLE5-STORM-LINUX-COMMISSION.md`.

---

## ✅ Verification banner

**6 / 6 load-bearing (P0-critical) citations independently verified against primary or first-party sources this pass; 0 fabricated; remaining citations accepted as-cited but not independently re-fetched (flagged `cited-unverified` in References). CI billing figures reused from the M6 briefing (verified 2026-07-08 in-repo).**

- **VERIFIED** — Handy Linux docs (github.com/cjpais/Handy): text pasting requires **external tools** — `xdotool` (X11), `wtype` ("preferred", Wayland), `dotool` (both); *"Without these tools, Handy falls back to enigo which may have limited compatibility, especially on Wayland."* Overlay on X11 *"can interfere with pasting transcribed text into target applications"* (fix: Overlay Position → None); on Wayland *"certain compositors treat it as the active window"* and it *"can steal focus, which prevents Handy from pasting back into the application."* *"On Wayland, system-level shortcuts must be configured through your desktop environment"* (GNOME/KDE/Sway/Hyprland instructions via CLI flags / `SIGUSR1`/`SIGUSR2`). Ships AppImage.
- **VERIFIED** — wtype requires the **`virtual-keyboard-unstable-v1`** Wayland protocol; **GNOME/Mutter does not implement it** (open Mutter feature requests #1974/#4124; wtype issues #45/#29: *"Compositor does not support the virtual keyboard protocol"*). wtype therefore **fails on default Ubuntu Wayland (GNOME)**; it works on wlroots compositors (Sway/Hyprland).
- **VERIFIED** — Ubuntu 23.10+/24.04 enables `apparmor_restrict_unprivileged_userns=1` (Launchpad #2046844), which **breaks the Chromium/Electron sandbox inside AppImages**: the SUID `chrome-sandbox` helper cannot be root-owned 4755 on a user-owned FUSE mount, and the fallback user-namespace sandbox is blocked by AppArmor → **FATAL at launch** unless the app has an AppArmor profile, is installed to a root-owned path (deb), or runs `--no-sandbox`.
- **VERIFIED** — nut.js (libnut lineage; repo uses `@nut-tree-fork/nut-js`): on Linux, keyboard automation is **X11 only; Wayland is not supported** (project README/docs; the documented workaround is logging into an X11 session).
- **VERIFIED** — libuiohook (the native core of `uiohook-napi`): Linux implementation is **XRecord (X11) only**; Wayland by design does not let one app observe global keystrokes, and wayland-protocols defines no global-hotkey protocol — compositor/DE-owned shortcuts are the sanctioned route.
- **VERIFIED** — FFmpeg's `pulse` input (`-f pulse -i default`) records the default source on PulseAudio systems **and on PipeWire systems via the `pipewire-pulse` compatibility layer** (Ubuntu 24.04 default stack; Ubuntu 22.04 runs real PulseAudio — same API either way).

---

## 60-second summary

Linux splits into **two different platforms wearing one trenchcoat**. On **X11** (Ubuntu's "Ubuntu on Xorg" session, still one login-screen click away), SpeakFlow's existing stack ports almost unchanged: `uiohook-napi` hooks keys via XRecord, `@nut-tree-fork/nut-js` sends Ctrl+V via XTest, read-only foreground introspection is a `spawnSync` of stock X11 tools (mirroring the `osascript` pattern from Wave 7a), and FFmpeg's `pulse` input replaces `dshow`/`avfoundation` in one branch. **Zero new native dependencies.** On **Wayland** (Ubuntu's default session), every one of those input mechanisms is structurally absent by security design: nut-js is X11-only, wtype needs a protocol GNOME never implemented, global hotkeys belong to the compositor, and the tools that do work (`ydotool`/uinput) need root-class setup. The verified competitor evidence (Handy) shows what "supporting Wayland auto-paste" actually looks like: ask users to apt-install helper tools, disable your own overlay so it stops stealing focus, and wire compositor-side shortcuts by hand — precisely the friction and focus-steal behavior SpeakFlow's invariants #15/#18 forbid.

The two decision-grade surprises: **(1) deb beats AppImage as the primary artifact** — Ubuntu 24.04's AppArmor user-namespace restriction hard-crashes sandboxed Electron AppImages at launch (Handy escapes this only because it's Tauri/WebKit, not Electron), while a deb installs `chrome-sandbox` root-owned at a real path and just works; ship AppImage second, with the caveat documented. **(2) SpeakFlow's hands-free-first design is a genuine Wayland advantage** — VAD needs a microphone, not a keyboard hook, so the Wayland floor (speak → transcript on clipboard + toast) works with *no* compositor cooperation, whereas hotkey-first competitors lose their core trigger. X11 gets full parity; Wayland gets an honest, working floor. That is the whole ship.

---

## 6 ranked findings

### F1 — Wayland auto-paste is structurally unavailable to SpeakFlow's stack on default Ubuntu; the clipboard+toast floor is the only honest ship. `confidence 9/10`
- **Supported-by:** Wayland Skeptic (**verified**: nut-js X11-only; wtype requires `virtual-keyboard-unstable-v1`, absent from Mutter → dead on default Ubuntu GNOME Wayland), Competitor Historian (**verified** Handy docs: external-tool installs, focus-steal on Wayland overlays, DE-owned shortcuts), repo law (Invariant #15: never require manual tool installs; #18: no focus games).
- **Challenged-by:** Practitioner steelman — "wtype works fine on Sway/Hyprland." True and verified, but that audience *chose* a power-user compositor and can read a README; the default-Ubuntu user cannot be asked to `sudo apt install wtype` for a feature that still won't work on their GNOME session. `ydotool` (uinput) works everywhere but needs a root daemon/udev rules — worse friction, and an injection mechanism SpeakFlow can't verify targets for (no foreground introspection on Wayland → violates the paste-safety ladder's own preconditions).
- **Consequence:** L-C7 confirmed at evidence level. Wayland ships **clipboard+toast only**, stated in README. A wlroots-only `wtype` backend is a *possible future opt-in*, but it must be scored by WARGAME (spoiler: it fails the ≥7/10 bar — no foreground verification exists on Wayland, so the ladder can't prove the target).

### F2 — The X11 path needs zero new native dependencies; the Wave 7a darwin pattern ports one-to-one. `confidence 8/10`
- **Supported-by:** X11 Practitioner (**verified**: uiohook-napi = XRecord on X11; nut-js = XTest on X11; both already ship Linux prebuilds in the deps SpeakFlow uses today — `package.json` already asar-unpacks `uiohook-napi/prebuilds/**`), repo ground truth (`darwin-window.ts` proves the "spawnSync a stock OS tool, parse, wrap in pseudo-hwnd" pattern; `getForegroundInfo()` already has the platform switch waiting for a `linux` arm).
- **Challenged-by:** Skeptic — foreground introspection via `xdotool` would add an external tool dependency. Resolved: use **`xprop`** (`_NET_ACTIVE_WINDOW` → `WM_CLASS`/`_NET_WM_PID` → `/proc/<pid>/comm`), part of stock `x11-utils`, read-only, EWMH-standard — and declare it in the deb `Depends` so apt guarantees it. `@nut-tree-fork/libnut-linux` prebuild availability is `cited-unverified` → first Linux CI run must validate it (Wave 7b/7c embedded spike).
- **Consequence:** `linux-window.ts` mirrors `darwin-window.ts` (pseudo-hwnd `linux:<windowId>`, pure parsers unit-testable on any OS); the existing `decidePaste` ladder gets a Linux terminal table (WM_CLASS/process names) and nothing else changes. Ctrl+V is the Linux paste chord (same as Windows).

### F3 — deb is the primary Linux artifact; AppImage is secondary with a documented sandbox caveat. `confidence 8/10`
- **Supported-by:** Packager (**verified**: Ubuntu 23.10+/24.04 `apparmor_restrict_unprivileged_userns` → Electron AppImage sandbox FATAL at launch; deb installs to a root-owned path where the SUID `chrome-sandbox` works normally), Competitor Historian (Handy ships AppImage *because it's Tauri* — no Chromium SUID sandbox to break; OpenWhispr is the Electron peer and targets AppImage/deb — `cited-unverified` for its 24.04 behavior).
- **Challenged-by:** "AppImage is the universal Linux format" folk wisdom — true for distribution reach, no longer true for *sandboxed Electron on the No. 1 target distro*. Never ship `--no-sandbox` as user guidance; it's acceptable only inside CI launch-verification on a throwaway runner.
- **Consequence:** electron-builder `linux.target = ["deb", "AppImage"]`, README installs lead with the deb, AppImage carries an honest 24.04 note (AppArmor profile or use the deb). deb `Depends` also solves FFmpeg + `x11-utils` acquisition (F4) via apt — the sanctioned, zero-manual-steps path (#15-compliant: a package manager resolving declared dependencies is not a "manual binary step").

### F4 — Capture is the lowest-risk wave: one `-f pulse -i default` branch covers Ubuntu 22.04 (PulseAudio) and 24.04 (PipeWire) identically. `confidence 9/10`
- **Supported-by:** Audio Engineer (**verified**: FFmpeg `pulse` input + `pipewire-pulse` compatibility layer; `pactl` works against both stacks), repo ground truth (`capture.ts` isolates the input format in `buildFfmpegContinuousArgs`; `resolveAvfAudioInput`/`resolveDshowAudioInput` show the exact override-env + default pattern to mirror as `resolvePulseAudioInput`, default `default`, override `SPEAKFLOW_PULSE_AUDIO`).
- **Challenged-by:** wrong-default-device reality (multi-source laptops, monitor sources) — same class of problem Windows GUID resolution already solved; mitigated with the env override, a `pactl list sources short` troubleshooting line, and the existing `SPEAKFLOW_VAD_DEBUG` RMS telemetry.
- **Consequence:** Invariant #17 holds by construction (FFmpeg stays the sole mic owner; the ring-buffer/VAD pipeline is platform-agnostic above the input flag). CI can even smoke this headlessly: start PulseAudio/PipeWire with a null-sink on `ubuntu-latest` and assert FFmpeg reads frames.

### F5 — Hands-free-first is a competitive advantage on Wayland; PTT is X11-only and must be session-gated, not assumed. `confidence 8/10`
- **Supported-by:** Wayland Skeptic (**verified**: libuiohook = XRecord, no Wayland; global shortcuts are compositor-owned), Competitor Historian (**verified**: Handy's Wayland answer is "configure shortcuts in your DE and signal the app" — hotkey-first design pays the full Wayland tax), repo ground truth (VAD hands-free consumes FFmpeg PCM — no window-system privilege at all).
- **Challenged-by:** none material — but `uIOhook.start()` behavior in a Wayland session (XWayland present) is undefined-by-default and must be guarded (try/catch + session detection) so a hook failure can never take down the tray app.
- **Consequence:** X11 = full parity (PTT + hands-free). Wayland = hands-free VAD → clipboard+toast floor, PTT honestly listed as X11-only. The README sells this straight: "on Wayland, speak — no hotkey needed."

### F6 — ubuntu-latest is the cheapest runner GitHub sells, but the packaging workflow still ships dispatch/tags-only — discipline by policy symmetry, mechanized like G24. `confidence 9/10`
- **Supported-by:** CI Economist (billing **verified 2026-07-08** in the M6 briefing: Linux $0.006/min vs macOS $0.062/min — Linux is the 1× baseline; Pro = 3,000 private min/mo), repo law (L-C6; `check-workflows.mjs` already mechanizes the macOS rule; `mac-package.yml` is the proven template), P4 reality (Windows dev box → `ubuntu-latest` is the *only* Linux build factory, so its budget is the milestone's oxygen).
- **Challenged-by:** "Linux minutes are cheap, why not on-push?" — because packaging jobs are 6–10 min each, electron-builder downloads are cache-dependent, and an agentic fix-loop through a packaging workflow burns quota that the (private-repo) *test* matrix also draws from. Deliberate runs also keep artifact provenance clean (L-C9 Drive-link distribution).
- **Consequence:** `linux-package.yml` = `workflow_dispatch` + `v*` tags only, full cache set (npm, Electron, electron-builder), and `check-workflows.mjs` grows a rule: **any `*-package.yml` must be dispatch/tags-only** — one gate now covers Mac and Linux. Bonus over macOS: the Linux artifact can be **launch-verified headlessly on the runner itself** (`xvfb-run` + `TEST_MODE`), something the Mac pipeline could only approximate with bundle inspection.

---

## A2 — Contradiction map

1. **Direct conflicts:**
   - *Handy: "wtype (preferred)" for Wayland* vs *verified Mutter protocol absence.* → Resolved by audience split: wtype genuinely works on wlroots (Sway/Hyprland) and is dead on default Ubuntu GNOME. "Preferred" is honest only for tiling-WM users. SpeakFlow's default-Ubuntu target makes the clipboard floor the only universal truth; a wlroots-only backend is future opt-in at best (WARGAME must score it).
   - *"AppImage is the universal Linux artifact"* vs *verified 24.04 AppArmor sandbox breakage for Electron.* → Resolved by engine distinction: the folk wisdom was earned by non-Chromium apps (Handy/Tauri). For Electron, deb-first is the 2026 reality on Ubuntu.
   - *Invariant #15 (never require manual binary installs)* vs *FFmpeg/xprop not bundled on Linux.* → Resolved by the deb `Depends` mechanism: apt resolving declared dependencies at install time is the platform-sanctioned equivalent of `extraResources` bundling — zero manual user steps. The AppImage (no dependency mechanism) documents the gap honestly; bundling a static ffmpeg is a later option, not an M7b blocker.
2. **Strongest vs weakest evidence:** Strongest — Mutter protocol absence (primary GitLab tracker), AppArmor userns restriction (primary Launchpad + multiple independent reproductions), Handy's own docs (first-party). Weakest — `@nut-tree-fork/libnut-linux` prebuild quality/availability and OpenWhispr's actual Linux paste implementation details — both demoted to `cited-unverified`, validated by the first Linux CI run and not load-bearing for any locked decision.
3. **Single resolving empirical question:** *Does nut-js Ctrl+V, fired from the packaged deb on a stock Ubuntu 24.04 "Xorg" session, land in Cursor chat and GNOME Terminal ≥8/10 with zero wrong-target pastes?* — That is metric L-2 verbatim, and it is the only question the desk research cannot answer. Everything else is plumbing already proven on two platforms.
4. **Universal agreement (load-bearing truth):** Wayland's input-security model is not a bug to route around — root-daemon injectors and focus-stealing overlays are the failure modes, not the fixes. X11-first with a Wayland floor is what every honest peer actually ships, whatever their README headline says.
5. **Blind spot → 6th lens:** every lens treated Wayland injection as "missing." The **xdg-desktop-portal** lens says it's *arriving*: the GlobalShortcuts portal and RemoteDesktop/libei (EIS) input path are the sanctioned Wayland mechanisms that GNOME/KDE are actually implementing. Electron doesn't surface them yet. Out of scope for M7b; first-class candidate for the milestone after (see Frontier question).

---

## Hidden connection

Wayland enforces, at the compositor level, the **same policy SpeakFlow already imposed on itself** on Windows: applications may not observe global input, may not steal focus, may not synthesize keystrokes into arbitrary windows. Invariants #18/#19 and the `decidePaste` verify-before-keystroke ladder are a *voluntary Wayland* — which is why the port is philosophically trivial: where the platform grants introspection (X11), the existing ladder runs unchanged; where it doesn't (Wayland), the ladder's own null-target guard already answers "clipboard+toast." SpeakFlow never fights the compositor because it never granted itself the powers the compositor removes. The competitors' Wayland pain (focus-stealing overlays, root injection daemons, DE-shortcut homework) is the cost of having built on powers X11 never should have given them.

---

## Missing 6th lens / key assumptions

**Assumption 1 (flagged):** `@nut-tree-fork/libnut-linux` prebuilds exist, load in packaged Electron 41 on Ubuntu 22.04/24.04, and XTest keystrokes reach X11 apps — `cited-unverified`; the first Linux package run + X11 smoke must validate before any paste claim (Wave 7b/7c embedded spike, mirroring the Mac ad-hoc-signature spike).
**Assumption 2 (flagged):** Electron 41 on Ubuntu launches as an X11/XWayland client by default (Ozone auto does not silently flip to native Wayland and break XTest delivery into XWayland peers). Mitigation is one line if needed (`--ozone-platform=x11` guidance), but validate on the smoke, don't assume.
**Assumption 3 (flagged):** the GitHub runner's `ubuntu-latest` can run PulseAudio/PipeWire with a null source for the capture smoke — validated cheaply in Wave 7d; if not, the capture gate degrades to a device-enumeration assertion.

---

## Close-the-gap outputs (mandated by INTENT §7 lenses)

| # | Lens | Finding |
|---|------|---------|
| **1** | X11 paste | **nut-js Ctrl+V** (XTest, already a dep, Linux prebuilds) behind the **unchanged `decidePaste` ladder**; foreground read via **`xprop`** spawnSync (`_NET_ACTIVE_WINDOW` → `WM_CLASS` + `_NET_WM_PID` → `/proc/<pid>/comm`), mirroring `darwin-window.ts`; Linux terminal table (gnome-terminal-server, konsole, xterm, alacritty, kitty, wezterm, tilix, xfce4-terminal, terminator…) added to the pure classifier. Clipboard+toast remains the guard outcome. No xdotool anywhere — and **never** `xdotool windowactivate`/`wmctrl -a` (L-C3). |
| **2** | Wayland | **Clipboard+toast floor, period** (F1). wtype fails on default Ubuntu (Mutter lacks the protocol — verified); ydotool needs root-class setup; no foreground introspection exists, so the safety ladder cannot verify any target. Handy's overlay-focus-steal is the anti-pattern; SpeakFlow's tray stays `showInactive`-only. Session detected via `XDG_SESSION_TYPE`/`WAYLAND_DISPLAY`; keystroke path hard-gated to X11 sessions. |
| **3** | Capture | **`-f pulse -i default`** one-branch addition to `buildFfmpegContinuousArgs`; `resolvePulseAudioInput()` with `SPEAKFLOW_PULSE_AUDIO` override mirrors the avfoundation pattern; works on 22.04 (PulseAudio) and 24.04 (PipeWire via pipewire-pulse) — verified. FFmpeg acquired via deb `Depends` (apt, zero manual steps) with PATH fallback; #17 untouched. |
| **4** | Packaging | **deb primary** (24.04 AppArmor reality — verified), **AppImage secondary** with documented caveat. electron-builder `linux` target added to the existing `build` block; `asarUnpack` gains `@nut-tree-fork/libnut-linux`; deb `Depends: ffmpeg, x11-utils`. Handy ships AppImage (Tauri — different sandbox physics); OpenWhispr (Electron peer) ships both. |
| **5** | CI | `linux-package.yml` cloned from `mac-package.yml` discipline: **dispatch + `v*` tags only** (L-C6), full cache set, gates-before-package, **headless launch-verify on the runner** (`xvfb-run` + `TEST_MODE=true`, `--no-sandbox` allowed in CI only), artifact hygiene step. `check-workflows.mjs` extended: any `*-package.yml` must be dispatch/tags-only. Native addons (`uiohook-napi`, `onnxruntime-node`, nut-js fork) all publish Linux prebuilds — `npm ci` on ubuntu-latest needs no toolchain (validated by the existing green ubuntu test lane). |
| **6** | Competitor forensics | Handy's documented Linux pain, mapped to what SpeakFlow must NOT repeat: ① require users to apt-install injection tools for the *default* path; ② ship an overlay that steals focus on Wayland (tray = `showInactive` only, #18); ③ promise "Wayland support" while the paste path silently fails (README states the floor); ④ leave hotkeys as DE homework without a working no-hotkey mode (hands-free VAD is the Wayland star — F5). |

---

## Actionable moves for M7b

1. **Wave 7b first: `build.linux` (deb + AppImage) + `linux-package.yml`** (dispatch/tags, cached, gates-first, xvfb launch-verify, hygiene). Extend `check-workflows.mjs` to cover all `*-package.yml`. This proves L-1 and validates Assumption 1's packaging half before any feature code.
2. **`linux-window.ts` mirroring `darwin-window.ts`:** pure parsers + `xprop` spawnSync; pseudo-hwnd `linux:<windowId>`; wire into `getForegroundInfo()`/`getForegroundAndCheckWindow()`; session detection module gates every keystroke path to X11.
3. **`capture.ts` pulse branch** + `resolvePulseAudioInput()` (env override, `pactl` troubleshooting copy); runner null-source smoke.
4. **PTT on X11 via existing uiohook** with a guarded `uIOhook.start()` (try/catch + session check — a hook failure must never kill the tray); hands-free VAD requires nothing new.
5. **Wayland floor wave:** verify clipboard+toast end-to-end on GNOME Wayland, keystroke path provably unreachable (grep-gate + session gate), README/user-guide honesty row.
6. **Grep-gates:** extend `check-focus-grep.mjs` — add `linux-window.ts` to checked files; forbid `windowactivate`, `wmctrl -a`, `XSetInputFocus(` in the paste path (L-C3 mechanized).
7. **Never repeat Handy's four Linux sins** (Close-the-gap #6). The README Linux row ships as: **X11 = supported (beta) · Wayland = clipboard floor · PTT = X11 only · hands-free = both.**

---

## Claim safety guide

- **Assert freely:** "wtype cannot work on default Ubuntu Wayland — Mutter doesn't implement virtual-keyboard-v1" (verified, primary trackers). "Sandboxed Electron AppImages crash at launch on stock Ubuntu 24.04 due to AppArmor userns restrictions" (verified, Launchpad + reproductions). "nut-js and uiohook are X11-only on Linux" (verified, first-party). "FFmpeg `-f pulse` works on both PulseAudio and PipeWire Ubuntu" (verified). "Handy requires external tools for Linux paste and documents Wayland focus-steal" (verified, first-party docs).
- **Caveat:** "nut-js fork's Linux prebuilds load and XTest-paste from packaged Electron" → *cited-unverified; Wave 7b/7c CI + X11 smoke must validate.* "OpenWhispr ships working Linux AppImage+deb" → *cited-unverified details.* "Electron 41 defaults to XWayland on Ubuntu Wayland sessions" → *validate on smoke; one-flag mitigation exists.*
- **Avoid:** claiming "Linux supported" before L-2 smoke passes on a real X11 desktop; claiming any Wayland auto-paste; recommending `--no-sandbox` to users; presenting deb `Depends` as "bundled" (it's *sanctioned acquisition*, say so); quoting Handy's Wayland tool list as if those tools work on GNOME.

---

## Frontier question

When Electron (or a thin native module) exposes the **xdg-desktop-portal GlobalShortcuts and RemoteDesktop/libei (EIS)** interfaces — the *actually sanctioned* Wayland input path that GNOME and KDE are implementing — can SpeakFlow become the first dictation tool whose Wayland paste is **permission-prompted, compositor-approved keystroke injection** with real foreground verification, rather than a root daemon or a dead protocol? (Post-M7b evaluation; would upgrade the Wayland floor to true parity without violating a single invariant.)

---

## References (with verification status)

| # | Claim it supports | URL | Status |
|---|---|---|---|
| R1 | Handy Linux: xdotool/wtype/dotool requirement, enigo fallback, overlay focus-steal on Wayland, DE-owned shortcuts, AppImage | https://github.com/cjpais/Handy | **verified 2026-07-09** |
| R2 | wtype fails without `virtual-keyboard-unstable-v1` ("Compositor does not support the virtual keyboard protocol") | https://github.com/atx/wtype/issues/45 (also #29, #22) | **verified 2026-07-09** |
| R3 | Mutter does not implement virtual-keyboard-v1 (open feature requests) | https://gitlab.gnome.org/GNOME/mutter/-/work_items/1974 · /4124 | **verified 2026-07-09** |
| R4 | Ubuntu 23.10+/24.04 AppArmor unprivileged-userns restriction breaks Electron/Chromium sandbox in AppImages | https://bugs.launchpad.net/bugs/2046844 (+ independent reproductions) | **verified 2026-07-09** |
| R5 | nut.js Linux = X11 only, no Wayland | https://github.com/nut-tree/nut.js (README/docs) | **verified 2026-07-09** |
| R6 | libuiohook Linux = XRecord/X11 only; no Wayland global hooks; no wayland-protocols global-hotkey protocol | https://github.com/kwhat/libuiohook (+ tauri-apps/global-hotkey#28) | **verified 2026-07-09** |
| R7 | FFmpeg `-f pulse -i default`; PipeWire pulse compatibility | FFmpeg devices docs + pipewire-pulse (multiple first-party) | **verified 2026-07-09** |
| R8 | GH Actions billing: Linux $0.006/min baseline vs macOS $0.062/min; Pro 3,000 private min/mo | https://docs.github.com/…/about-billing-for-github-actions | **verified 2026-07-08 (M6 briefing R1, reused)** |
| R9 | OpenWhispr: Electron, macOS/Windows/Linux targets, MIT | https://github.com/OpenWhispr/openwhispr | verified 2026-07-08 (M6 R5); Linux artifact details cited-unverified |
| R10 | electron-builder `linux` targets (AppImage default, deb config: category/maintainer/depends) | https://www.electron.build/linux | cited-unverified (docs 404'd this pass) — **Wave 7b first run validates config** |
| R11 | `@nut-tree-fork/libnut-linux` prebuilds load in packaged Electron on Ubuntu | npm `@nut-tree-fork/libnut-linux` | cited-unverified — **Wave 7b/7c CI must validate** |
| R12 | ydotool requires uinput root daemon/udev setup | https://github.com/ReimuNotMoe/ydotool | cited-unverified |
