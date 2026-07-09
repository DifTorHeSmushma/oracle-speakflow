# M7b Linux Parity — Engineering Spec (Oracle SpeakFlow)

**Date:** 2026-07-09
**Author:** Fable 5 (Spec lane — Session 2, Spec only; reads C1 PRD cold per INTENT §0 handoff discipline)
**Status:** ✅ **Gate D1 APPROVED (2026-07-09)** — DOM signed §0–§13 (auto-paste on X11 supported sessions; Wayland unsupported for auto-paste per matrix). Implementation may begin — **Wave 7b FIRST**, STOP-gated.
**Authority (read from disk, in order):**
- Approved PRD: `docs/DESIGN/M7_LINUX_PARITY_PRD.md` (Gate C1 APPROVED 2026-07-09, **DOM auto-paste amendment**) — P-L1…P-L5, LD1–LD16, §11 open questions
- Approved Intent: `docs/DESIGN/INTENT-m7b-linux-parity.md` (Gate B7b, 2026-07-09) — L-C1…L-C10, **L-C7 auto-paste revised**
- Wargame: `docs/DESIGN/WARGAME-m7-linux-parity.md` (8.3/10 — S-L1…S-L16; **wtype scored 1.8/10, do not use**)
- STORM: `docs/DESIGN/storm-reports/speakflow-linux-parity-2026-briefing.md` (6/6 verified; F1–F6, Assumptions 1–3)
- Repo law: `CLAUDE.md` (invariants #1–#19; #17/#18/#19 load-bearing here)
- House style: `docs/DESIGN/M6_PUBLIC_LAUNCH_SPEC.md` (Spec altitude; G13–G26; §9b re-review format)
- Brownfield: `paste.ts`, `darwin-window.ts`, `win32-window.ts`, `capture.ts`, `avfoundation-audio.ts`, `electron-main.ts`, `package.json`, `ci.yml`, `mac-package.yml`, `scripts/check-focus-grep.mjs`, `scripts/check-workflows.mjs`

**Altitude:** *How.* File paths, module contracts, parsers, timeouts, YAML, gates, waves. Intent/what-why lives in the PRD.

**DOM C1 amendment carried verbatim (non-negotiable):** hands-free **MUST auto-paste** into the focused app on every supported Linux session — same bar as Windows. PTT (F8-class hotkey) is backup and must also auto-paste. Clipboard+toast is the **guard fallback only** (own-window, unverified foreground, alt-tab) — never the designed primary path on a supported session. Sessions without verified auto-paste are **unsupported** and never listed as supported.

> This Spec **resolves PRD §11 Open Questions 1–11 verbatim** (§0), honors **LD1–LD16** (§0.1), meets the **Wargame B0.2 parity bar** (§0.2), carries the **L-C6/LD13 CI-runner policy** (§6), extends the gate matrix to **G27–G35** (§8), and sequences **five STOP-gated waves 7b–7f** with the LD7 nut-js spike embedded in 7b/7c (§10). It **stops at Gate D1.**

---

## 0. Resolution of PRD §11 Open Questions

### Q1 — Foreground-read invocation, parser contracts, pseudo-hwnd, own-window detection (PRD §11.1; LD6; S-L8/S-L12)

**Decision — `src/utils/linux-window.ts`, mirroring `darwin-window.ts`: read-only `spawnSync` of stock `xprop` (deb `Depends: x11-utils`), pure parsers unit-testable on any OS, `linux:` pseudo-hwnd namespace.** No xdotool, no wmctrl, no native X bindings — zero new dependencies (LD6; STORM F2).

**Invocation (two reads + one file read, all read-only):**

1. **Active window id:** `spawnSync("xprop", ["-root", "-notype", "_NET_ACTIVE_WINDOW"], { encoding: "utf8", timeout: 3_000 })`
   → stdout `_NET_ACTIVE_WINDOW: window id # 0x3c00007` → `parseActiveWindowId` → `"0x3c00007"`.
2. **Class + PID:** `spawnSync("xprop", ["-id", <winId>, "-notype", "WM_CLASS", "_NET_WM_PID"], { encoding: "utf8", timeout: 3_000 })`
   → `WM_CLASS = "gnome-terminal-server", "Gnome-terminal"` and `_NET_WM_PID = 4242`.
3. **Process name:** `readFileSync("/proc/<pid>/comm", "utf8").trim()` — no extra spawn, no `.exe` suffix (Linux process names are bare, e.g. `gnome-terminal-`(15-char comm truncation is accepted and handled in the terminal table §4.1)).

**Timeouts:** 3 000 ms per `xprop` spawn (identical to win32 PowerShell and darwin osascript reads). Any spawn error, non-zero exit, timeout, unparsable output, or missing `/proc` entry → **`getLinuxForegroundInfo()` returns `null`** with one stderr line (`[linux] getForegroundInfo failed: …`) — the ladder answers clipboard+toast, the safe direction (S-L8).

**Pseudo-hwnd format:** `linux:<windowIdHexLowercase>` — e.g. `linux:0x3c00007`. X11 window ids are stable for the window's lifetime, so **re-verify uses strict equality** (`foreground.hwnd === expectHwnd`) — the same strength as the win32 HWND check and *stronger* than darwin's name matching.

**`ForegroundInfo` mapping (existing shape, no changes — LD2):**
- `hwnd`: `linux:<windowId>`
- `className`: WM_CLASS **class** part (second string), lowercased — e.g. `gnome-terminal`
- `processName`: `/proc/<pid>/comm` trimmed, lowercased — e.g. `gnome-terminal-`

**Own-window detection (S-L12) — precedence PID first, WM_CLASS second, false-positive-safe:**
1. **PID match** (strong evidence): `_NET_WM_PID === process.pid` → own window. Chromium sets `_NET_WM_PID` on its X windows from the browser (main) process.
2. **WM_CLASS fallback** (survives PID mismatch under any sandbox/zygote arrangement): class or instance contains any of `oracle speakflow`, `oracle-speakflow`, `electron` (token match, lowercased) → own window.
3. Neither → external.

Mis-detection direction is safe by construction: a **false positive** (external window mistaken for own) yields clipboard+toast; a false negative is prevented by running *both* checks. The retained final own-window gate inside `decidePaste` (M6 S8 pattern) still applies after any yield.

**Liveness check (`isLinuxPriorTargetAlive`)**: `spawnSync("xprop", ["-id", <winId>, "-notype", "WM_CLASS"], …)` exit status 0 → alive. Dead/invalid id → non-zero exit → `false` → clipboard+toast (mirrors darwin `isDarwinPriorTargetAlive`).

Full module contract in §3.2.

### Q2 — Session-detection contract and gate position (PRD §11.2; LD4; S-L2/S-L9)

**Decision — `src/utils/linux-session.ts`: pure env-based detection, cached once, fail-safe to "no keystroke".**

```ts
export type LinuxSession = "x11" | "wayland" | "unknown";

/** Pure — takes env for unit-testability (G29). */
export const detectSessionFromEnv = (env: Record<string, string | undefined>): LinuxSession => {
  const t = env["XDG_SESSION_TYPE"]?.trim().toLowerCase();
  if (t === "wayland") return "wayland";
  if (t === "x11") return "x11";
  if (env["WAYLAND_DISPLAY"]) return "wayland";   // WAYLAND_DISPLAY beats DISPLAY (see below)
  if (env["DISPLAY"]) return "x11";
  return "unknown";
};

/** Cached at first call from process.env; module-level memo. */
export const getLinuxSession = (): LinuxSession;
```

**Precedence rationale (locked):** `XDG_SESSION_TYPE` is the login-session authority and wins outright. When absent, `WAYLAND_DISPLAY` **must beat** `DISPLAY`, because every Wayland session with XWayland exports *both* — resolving that tie to `x11` would unlock the keystroke path inside a session where `_NET_ACTIVE_WINDOW` cannot see wayland-native windows and the 0-wrong-target floor is unverifiable (S-L2/S-L9). `unknown` (headless, SSH, exotic) is treated exactly like `wayland`: **no keystroke, ever.**

**Gate position relative to the yield ladder — two independent locks (LD4), both upstream-and-downstream:**
- **Lock A (upstream of everything):** `getLinuxForegroundInfo()` returns `null` unless `getLinuxSession() === "x11"`. On non-X11 sessions no foreground is ever captured, so `capturedHwnd === null` → `decidePaste` → `clipboardToast` before the yield ladder is even consulted, and `decideYield` never sees a live prior target.
- **Lock B (at the executor):** the keystroke executor in `electron-main.ts` re-asserts `process.platform !== "linux" || getLinuxSession() === "x11"` immediately before any `keyboard.pressKey` call; failure → clipboard+toast. A stray keystroke on Wayland requires **both** locks to fail open simultaneously — structurally unreachable (Wargame S-L2 verdict preserved).

The session is detected once at startup (also reported via `platform-caps` IPC, §7) — sessions do not change type mid-process.

### Q3 — `linux-package.yml` shape (PRD §11.3; LD8/LD9/LD13/LD14; S-L4/S-L7/S-L11/S-L14)

**Decision — clone `mac-package.yml` discipline exactly: `workflow_dispatch` + `v*` tags ONLY, `ubuntu-latest`, full cache set, gates-before-package, headless launch-verify, artifact hygiene.**

**Triggers:** identical to `mac-package.yml`:
```yaml
on:
  workflow_dispatch:
  push:
    tags:
      - "v*"
```
Mechanized by the generalized G27 gate (Q4) — any widening fails every CI run.

**Cache keys** (Linux paths; keyed like the mac workflow):
- npm: `~/.npm`, key `${{ runner.os }}-npm-${{ hashFiles('package-lock.json') }}`
- Electron: `~/.cache/electron`, key `${{ runner.os }}-electron-${{ hashFiles('package-lock.json') }}`
- electron-builder: `~/.cache/electron-builder`, key `${{ runner.os }}-electron-builder-${{ hashFiles('package-lock.json') }}`

**Gates-before-package order** (byte-for-byte the mac list): `check:manifest` (G14) → `check:focus` (G19/G30) → `check:workflows` (G24/G27) → `typecheck` → `npm test` → `test:ui` → `build` → `build:ui` → `mkdir -p resources/bin` (gitignored; Linux ships **no** bundled whisper binaries this cycle — LD15) → `npx electron-builder --linux --publish never` with `CSC_IDENTITY_AUTO_DISCOVERY: "false"`.

**`package.json` electron-builder additions (Wave 7b):**
```jsonc
"linux": {
  "target": [ { "target": "deb", "arch": ["x64"] }, { "target": "AppImage", "arch": ["x64"] } ],
  "category": "Utility",
  "maintainer": "Domenic Young <domenic.369@gmail.com>",
  "executableName": "oracle-speakflow",
  "artifactName": "${productName}-${version}-${arch}.${ext}"
},
"deb": {
  // Overriding `depends` REPLACES electron-builder's defaults — the default runtime set
  // is re-declared explicitly, then ffmpeg + x11-utils appended (LD9, zero manual steps).
  "depends": [
    "libgtk-3-0", "libnotify4", "libnss3", "libxss1", "libxtst6",
    "xdg-utils", "libatspi2.0-0", "libuuid1", "libsecret-1-0",
    "ffmpeg", "x11-utils"
  ]
}
```
`asarUnpack` gains `"node_modules/@nut-tree-fork/libnut-linux/build/Release/**"` (mirrors the existing libnut-win32 entry). STORM R10 (electron-builder linux config fields) is `cited-unverified` → **the first Wave 7b run validates the config**; any field rejection is fixed in-wave, never by widening triggers.

**deb is the primary artifact** (LD8 — verified 24.04 AppArmor userns reality). AppImage is built best-effort; its launch check may fail without blocking the wave (deferral #1). `--no-sandbox` appears **only** inside CI verification steps, never in user-facing docs (degradation rule 4).

**Headless launch-verify (G28) — claim-scoped per LD14 ("CI proves *launches*; only human smoke proves *works*"):**
```bash
# 1. Dependency-resolution proof + root-owned install path (the deb's whole point):
sudo apt-get update && sudo apt-get install -y ./dist-installer/*.deb
# 2. Launch headlessly under a virtual X server:
export TEST_MODE=true
xvfb-run -a oracle-speakflow > /tmp/launch.log 2>&1 &
APP_PID=$!
sleep 10
# 3. Pass assertions:
kill -0 "$APP_PID"                                   # (a) main process alive at T+10 s
grep -q "\[SPIKE\] nut-js load: OK" /tmp/launch.log   # (b) packaged libnut-linux import OK (LD7 spike, half 1)
grep -qE "State transition|\[IPC\] sent state-change" /tmp/launch.log   # (c) renderer/state machine reached
! grep -qE "FATAL|Uncaught" /tmp/launch.log           # (d) no crash lines
kill "$APP_PID"
```
- **(b) is the Wave 7b half of the LD7 embedded spike:** a TEST_MODE-only, Linux-only additive block in `electron-main.ts` dynamically imports `@nut-tree-fork/nut-js` and logs `[SPIKE] nut-js load: OK` / `[SPIKE] nut-js load: FAIL: <msg>` to stdout. Systemic FAIL → **STOP, escalate to DOM** (sanctioned downgrade = clipboard floor on X11 too + scoped README, never an engine swap — PRD falsification P-L2-dependency).
- The deb install itself (step 1) proves the `Depends` list resolves on stock Ubuntu 24.04 with zero manual steps (L-4 packaging half).
- **AppImage check (best-effort, non-blocking):** `./dist-installer/*.AppImage --appimage-extract-and-run --no-sandbox` under `xvfb-run` with the same alive-at-10s assertion; `--no-sandbox` is CI-only (24.04 runner AppArmor blocks the sandboxed launch — S-L7, expected). Failure logs a warning and the README AppImage caveat stands.

**Artifact hygiene step (mirrors mac):** fail if any `.env` in `dist-installer`; fail if `/home/runner/` appears in user-facing metadata (`DEBIAN/control`, `.desktop` files, `*.yml` update metadata) — the full unpack tree is *not* grepped (native intermediates embed build paths; known mac false-positive). List artifact names + sizes. Upload `*.deb` and `*.AppImage` as separate artifacts (`if-no-files-found: error` for deb only). Distribution stays Actions download → Drive link; repo stays private (L-C9).

### Q4 — Workflow grep-gate generalization (PRD §11.4; LD13; S-L4)

**Decision — extend `scripts/check-workflows.mjs` with one additive rule; the existing macOS rule is untouched.**

New rule (G27): **every workflow file whose name matches `/-package\.ya?ml$/` must be dispatch/tags-only** — it must have **no** `pull_request` trigger and **no** branch-`push` trigger, regardless of runner OS.

Implementation reuses the two existing predicates verbatim — `hasPullRequestTrigger(content)` and `hasBranchPushTrigger(content)` (which already treats `push: tags:`-without-`branches:` as exempt) — so the macOS rule's parsing behavior cannot drift (PRD §11.4 requirement "without breaking the existing macOS rule"):

```js
// G27 — generalized packaging-CI discipline (LD13 / S-L4):
if (/-package\.ya?ml$/.test(file)) {
  if (hasPullRequestTrigger(content) || hasBranchPushTrigger(content)) {
    fail(`${file}: *-package.yml workflows must be workflow_dispatch/tags-only (LD13)`);
  }
}
// Existing macos-runner rule runs unchanged after this block.
```

Runs on every CI pass via the existing `check:workflows` step (already wired in `ci.yml` and `mac-package.yml`; `linux-package.yml` includes it in its gates-before-package list). **Release-blocking.** The moment an agent convenience-edit widens `linux-package.yml` to `on: push`, every branch build goes red (S-L4 detection).

### Q5 — Focus grep-gate extension (PRD §11.5; LD3; S-L6)

**Decision — extend `scripts/check-focus-grep.mjs` (G19 base) into G30: new forbidden patterns + new checked files. Existing patterns and comment-line filtering unchanged.**

```js
const FORBIDDEN_RE = [
  /SetForegroundWindow\s*\(/,   // existing (win32)
  /AttachThreadInput\s*\(/,     // existing (win32)
  /\bxdotool\b/i,               // NEW — no xdotool anywhere in the paste path (LD6: xprop only)
  /\bwmctrl\b/i,                // NEW — covers `wmctrl -a` and every other activation form
  /XSetInputFocus\s*\(/,        // NEW — raw Xlib activation
  /windowactivate/i,            // NEW — belt for string-built xdotool invocations
];

const CHECKED_FILES = [
  "src/electron-main.ts",
  "src/services/paste.ts",
  "src/services/yieldFocus.ts",
  "src/utils/linux-window.ts",   // NEW
  "src/utils/linux-session.ts",  // NEW
];
```

Notes: `\bwmctrl\b` is deliberately broader than the PRD's `wmctrl -a` — *any* wmctrl in these files is a policy breach since `xprop` is the only sanctioned external tool (LD6). The existing non-comment-line filter keeps documentation mentions legal. Yield on Linux remains `win.hide()` + re-verify only, mirroring darwin (LD3). **Hard floor, every CI run.**

### Q6 — Linux terminal table + Shift+Insert/PRIMARY nuance (PRD §11.6; LD2; S-L13)

**Decision — `paste.ts` gains data only (LD2: no OS calls, no new decision variants). The paste *chord* is chosen by the executor per platform — exactly how darwin already maps `ctrlV` → Cmd+V.**

**Terminal table additions (Wave 7c) — WM_CLASS classes (lowercased) added to `TERMINAL_CLASSES`:**
`gnome-terminal`, `gnome-terminal-server`, `org.gnome.terminal`, `konsole`, `xterm`, `uxterm`, `alacritty`, `kitty`, `org.wezfurlong.wezterm`, `tilix`, `xfce4-terminal`, `terminator`

**Process names (lowercased, `/proc` comm form — 15-char truncation included) added to `TERMINAL_PROCESSES`:**
`gnome-terminal-` (comm truncation of `gnome-terminal-server`), `gnome-terminal-server`, `konsole`, `xterm`, `alacritty`, `kitty`, `wezterm`, `wezterm-gui`, `tilix`, `xfce4-terminal`, `terminator`

The classifier's `unknown → clipboardToast` default keeps the long tail safe (PRD deferral #4); anything not in the table that isn't a terminal classifies `chat` → plain Ctrl+V, which is correct for editors/browsers/IDEs.

**Chord mapping (executor-level, `electron-main.ts` Linux branch — the load-bearing Q6 decision):**

| `decidePaste` action | Windows | macOS | **Linux (X11)** |
|---|---|---|---|
| `ctrlV`, target class `chat` | Ctrl+V | Cmd+V | **Ctrl+V** |
| `ctrlV`, target class `terminal` | Ctrl+V | Cmd+V | **Ctrl+Shift+V** |
| `shiftInsert` (opt-in variant) | Shift+Insert | Shift+Insert | Shift+Insert |

Rationale: VTE terminals (GNOME Terminal, Tilix, Xfce Terminal, Terminator) do **not** paste on Ctrl+V — Ctrl+Shift+V is their standard clipboard-paste chord, and it is also accepted by Konsole, Alacritty, Kitty and WezTerm. Without this mapping the L-2 GNOME Terminal smoke fails by construction. The mapping lives in the keystroke executor (which already receives the post-verify `ForegroundInfo` and can call the pure `classifyTarget`) — `decidePaste` and its variants are untouched (LD2).

**Shift+Insert/PRIMARY nuance (S-L13):** on X11, Shift+Insert pastes the **PRIMARY selection** in xterm-class terminals, not CLIPBOARD — stale-text hazard. Handling: `terminalVariantEnabled` stays **opt-in, off by default** (existing config; no change); the Linux user guide documents the nuance ("on X11 the Shift+Insert variant may paste your last mouse selection in xterm-class terminals — leave it off unless you know you want it"). Plain `xterm` remains in the table (classified terminal → Ctrl+Shift+V, which xterm ignores) — a silent no-op with the transcript already on the clipboard: degraded but safe, and xterm is **not** a smoke target or a supported-claim surface.

### Q7 — Capture branch wiring (PRD §11.7; LD5/LD10; S-L3; STORM F4/Assumption 3)

**Decision — one input-format branch + one resolver module, mirroring the avfoundation pattern byte-for-byte.**

**`src/utils/pulse-audio.ts` (new — Wave 7d):**
```ts
/**
 * Linux FFmpeg pulse audio input (`-f pulse -i <source>`).
 * Covers PulseAudio (Ubuntu 22.04) and PipeWire via pipewire-pulse (Ubuntu 24.04) — STORM F4 verified.
 * Override with SPEAKFLOW_PULSE_AUDIO (a pactl source name, e.g. from `pactl list sources short`).
 */
export function resolvePulseAudioInput(): string {
  const override = process.env["SPEAKFLOW_PULSE_AUDIO"]?.trim();
  return override || "default";
}
```

**`src/services/capture.ts` (modified — Wave 7d, two lines):**
```ts
function buildFfmpegContinuousArgs(audioInput: string): string[] {
  const inputFormat =
    process.platform === "darwin" ? "avfoundation" :
    process.platform === "linux"  ? "pulse" : "dshow";
  // …rest unchanged
}
function resolveAudioInput(ffmpegPath: string): string {
  if (process.platform === "darwin") return resolveAvfAudioInput();
  if (process.platform === "linux") return resolvePulseAudioInput();
  return resolveDshowAudioInput(ffmpegPath);
}
```
Everything above the input flag — ring buffer, 512-sample framing, VAD consumption, gain, single-mic-owner pipeline — is platform-agnostic and **untouched** (LD5, invariant #17 by construction). Kill-switch closes the FFmpeg device on Linux exactly as on Windows (#19; existing `captureSession.stop()` path, no new code).

- **Env override name:** `SPEAKFLOW_PULSE_AUDIO` (mirrors `SPEAKFLOW_AVF_AUDIO`/dshow pattern).
- **Default source:** `default` (the PulseAudio/PipeWire default source).
- **`pactl` triage copy (Linux user guide §Q10):** "No audio? Run `pactl list sources short` and `pactl get-default-source`. Either set the default (`pactl set-default-source <name>`) or launch with `SPEAKFLOW_PULSE_AUDIO=<name>`. Diagnose levels with `SPEAKFLOW_VAD_DEBUG=1` (RMS telemetry on stderr)." Wrong-device is configuration, not code (LD10).
- **Runner audio smoke (G31, in `linux-package.yml` as a dedicated step, Wave 7d):**
  ```bash
  sudo apt-get install -y pulseaudio pulseaudio-utils ffmpeg
  pulseaudio --start --exit-idle-time=-1
  pactl load-module module-null-sink sink_name=sf_test
  ffmpeg -f pulse -i sf_test.monitor -t 1 -ar 16000 -ac 1 -f s16le -y /tmp/cap.raw
  test -s /tmp/cap.raw   # non-empty ⇒ FFmpeg read frames through the pulse API
  ```
  Null-source feasibility is STORM Assumption 3 (`cited-unverified`): if the runner cannot host a pulse daemon, the gate **degrades to a device-enumeration assert** (`pactl list sources short` exits 0 and lists ≥1 source or the null-sink module loads) and the human smoke carries L-4 proof (Wargame 7d kill criterion — pre-authorized).

### Q8 — uiohook guarded-start contract on Linux (PRD §11.8; LD11; S-L10)

**Decision — session-gated, try/catch-wrapped start; a hook failure never takes down tray/capture; user-visible PTT status via a new one-shot IPC.**

`electron-main.ts` startup (replaces the bare `uIOhook.start()` for all platforms — additive guard, existing platforms keep identical behavior on the success path):

```ts
let hookStarted = false;   // guards uIOhook.stop() on shutdown paths

function startHotkeyHook(): void {
  if (process.platform === "linux" && getLinuxSession() !== "x11") {
    console.error("[HOTKEY] non-X11 session — PTT unavailable, hands-free unaffected (LD11)");
    return;                                  // hands-free VAD is the Wayland story
  }
  try {
    registerHotkey(activeHotkey);
    uIOhook.start();
    hookStarted = true;
  } catch (err) {
    console.error(`[HOTKEY] uIOhook.start failed — PTT unavailable, continuing: ${String(err)}`);
    // NEVER rethrow — tray + capture must survive (S-L10 hard rule)
  }
}
```
- `uIOhook.stop()` in `before-quit`/`SIGINT` becomes `if (hookStarted) uIOhook.stop()` (stop on a never-started hook is undefined behavior we don't gamble on).
- **User-visible messaging:** `platform-caps` IPC (§7) carries `pttAvailable: false` + `session`; the renderer settings/status surface shows *"Push-to-talk needs an X11 session — hands-free listening is active"* (copy finalized in Wave 7f honesty pass). No new Svelte component required (existing settings surface; #16 respected).
- PTT keydown/keyup handlers are unchanged; on X11 they run the existing capture/pipeline path and therefore **auto-paste exactly like hands-free** (DOM C1: PTT backup must also auto-paste — satisfied by construction since both modes converge on the same inject path).

### Q9 — Wave sequencing 7b–7f, STOP gates, human smoke scripts (PRD §11.9) — see §10 for the full wave table and §8.1 for the smoke protocols

Summary of the locked sequence: **7b package factory (G27/G28 + LD7 spike half 1) → 7c session/window/paste pure+wiring (G29/G30) → 7d capture (G31) → 7e PTT + human X11 smokes (G32/G33 — hard floors, auto-paste required) → 7f Wayland floor + README honesty (G34/G35)**. Each wave ends at its gate(s); STOP and report to DOM before the next. Kill criteria per wave in §10.

### Q10 — README claim table + Linux user guide (PRD §11.10; LD16; L-7)

**Decision — two artifacts, both regenerated from gate results in Wave 7f, both DOM-reviewed (G35).**

**README claim table (rows shipped only as their gates pass — pre-authorized downgrade wording per LD16):**

| Platform / session | Install | Hands-free auto-paste | PTT auto-paste | Local transcription |
|---|---|---|---|---|
| Windows 11 | NSIS installer | ✅ | ✅ | ✅ (3-tier, SHA-gated) |
| macOS (beta) | dmg/zip (ad-hoc) | ✅ | ✅ | ❌ cloud-first |
| **Ubuntu 24.04 — "Ubuntu on Xorg" (X11)** | **deb** | ✅ *(after G32/G33 pass)* | ✅ *(after G32 PTT part)* | ❌ this cycle — "local coming later" (LD15) |
| **Ubuntu 22.04 — X11** | deb | ✅ *only if its own G32 run passes; otherwise the row is omitted* | same | ❌ |

**Known-limitations section (honesty, not support claims — S-L1/Wargame B0.2 differentiator):**
- **Wayland (Ubuntu default session):** auto-paste **not supported** this cycle — hands-free still listens and transcribes (VAD needs no compositor privilege); output lands on the **clipboard with a toast**. PTT unavailable (compositor-owned hotkeys). No injection tool to install — none works safely on GNOME Wayland (wtype scored 1.8/10 in the Wargame; portal/libei is the post-M7b path).
- **AppImage on Ubuntu 24.04:** stock AppArmor blocks the sandboxed launch — **use the deb** (first instruction). `--no-sandbox` is never suggested.
- **Local transcription on Linux:** not shipped this cycle; selecting Local hard-blocks with an honest message — never silent cloud (L-C10).

**Linux user guide — `docs/LINUX_GUIDE.md` (new, Wave 7f):** install (deb via `apt install ./…deb`, resolves ffmpeg + x11-utils automatically); how to pick "Ubuntu on Xorg" at the login screen (screenshot-level steps); mic permission/first-run; supported-session verification (`echo $XDG_SESSION_TYPE`); **auto-paste verification walkthrough** (focus Cursor/GNOME Terminal → speak → text appears); PTT backup usage; troubleshooting (pactl triage from Q7, VAD debug, tray icon on non-Ubuntu GNOME → AppIndicator extension note S-L15, terminal variant nuance from Q6).

### Q11 — Supported-session matrix (PRD §11.11; LD12; DOM C1) — **normative**

**Decision — the supported matrix this cycle is X11-only. No Wayland configuration meets the evidence bar; no launch flag changes that.**

| Session | Verdict | Auto-paste mechanism | Evidence |
|---|---|---|---|
| **Ubuntu 24.04, "Ubuntu on Xorg" (X11, GNOME)** | **SUPPORTED — the L-2/L-3 hard-floor minimum.** Claim ships only after G32/G33 pass (≥8/10 hands-free auto-paste, 0 wrong-target). | in-process nut-js Ctrl+V (XTest) behind the unchanged `decidePaste` ladder + session gate | STORM F2 (verified: nut-js/uiohook X11 prebuilds); LD7 spike closes the packaged-runtime unknown |
| **Ubuntu 22.04, X11** | **SUPPORTED iff its own G32 smoke run passes**; otherwise omitted from the README (honest row, not assumed from 24.04). | same | same stack; PulseAudio vs PipeWire difference is capture-only and covered by F4 (verified) |
| **GNOME Wayland (Ubuntu default session)** | **UNSUPPORTED for auto-paste.** Floor behavior only: hands-free → clipboard+toast; PTT off; keystroke path structurally unreachable (Q2 locks). Listed under Known Limitations, never in the supported table. | none exists that passes the bar | wtype **1.8/10** (Wargame Axis 2 — Mutter lacks virtual-keyboard-v1, verified); ydotool/uinput and overlay focus-steal **rejected** (LD12) |
| Other compositors (KDE/Sway/Hyprland, X11 or Wayland) | **UNSUPPORTED / unlisted.** No claims, no rows. | — | PRD §9 non-goal (no compositor matrix this cycle) |

**Why `--ozone-platform=x11`/XWayland does NOT admit Wayland into the matrix (evidence assessment the PRD asked for):** that flag only forces *SpeakFlow's own window* onto XWayland. XTest keystrokes injected via XWayland are delivered **only to other XWayland clients** — a wayland-native target (GNOME Terminal, Cursor's default Wayland build, any modern GTK app on a Wayland session) never receives them; and `xprop _NET_ACTIVE_WINDOW` on the XWayland root cannot verify wayland-native foreground windows, so the ladder's verified-target precondition — the thing the 0-wrong-target floor stands on — is unmet. Auto-paste would be *unverifiable at best, wrong-target at worst* — the exact configuration DOM C1 forbids claiming. The flag is retained only as **S-L9 mitigation** (documented remedy if a future Electron flips to native-Wayland Ozone and breaks XTest *sending* on X11 sessions), not as a Wayland support vehicle.

**Portal/libei (the sanctioned future Wayland injection path)** is not reachable from Electron 41 (STORM Frontier, Wargame Axis 2 #8) — **post-M7b milestone candidate, explicitly out of scope; no spike is scheduled this cycle** so the milestone cannot silently grow a Wayland promise.

---

## 0.1 — Locked decisions LD1–LD16 honored

| LD# | Decision | Where satisfied in this Spec |
|---|---|---|
| LD1 | Additive branching only; Win/mac byte-stable | §5.1 wiring rules, §7 caps, §10 every wave, G25 inherited |
| LD2 | `paste.ts` stays pure — data only, `linux:` pseudo-hwnd | §0 Q1/Q6, §3.2, §4.1 |
| LD3 | No focus steal, mechanized; yield = `win.hide()` + re-verify | §0 Q5 (G30), §5.1 |
| LD4 | Keystroke session-gated to X11 + verified foreground (two locks) | §0 Q2 Locks A/B, §5.1 |
| LD5 | Mute hard-block + single mic owner untouched | §0 Q7 (capture branch only), G29 asserts `decidePaste` muted→block with `linux:` inputs |
| LD6 | X11 foreground = read-only spawnSync of stock xprop | §0 Q1, §3.2 |
| LD7 | nut-js Ctrl+V engine; packaged viability = embedded 7b/7c spike | §0 Q3 launch-verify probe (half 1), §8.1 G32 (half 2), §10 STOP rules |
| LD8 | deb primary, AppImage secondary + 24.04 caveat; no `--no-sandbox` in docs | §0 Q3, §0 Q10 |
| LD9 | Zero-friction deps via deb `Depends` (ffmpeg, x11-utils) | §0 Q3 depends list + install-proof step |
| LD10 | Capture = one pulse branch + env override; wrong-device = config | §0 Q7 |
| LD11 | PTT X11-only + guarded start; hands-free is the Wayland story | §0 Q8, §7 |
| LD12 | Auto-paste mandatory on supported Linux; wtype/ydotool/overlay rejected; matrix evidence-scoped | §0 Q11, §8.1 G32/G33 |
| LD13 | Packaging CI dispatch/tags-only, generalized grep-gate | §0 Q3/Q4 (G27), §6 |
| LD14 | Runner launch-verify claim-scoped (launches ≠ works) | §0 Q3 G28 wording, §8 |
| LD15 | Local mode hard-blocks honestly on Linux (no binaries shipped) | §0 Q3 (`mkdir resources/bin`), §0 Q10 limitations row, G29 non-regression of L5 machinery |
| LD16 | README claim table generated from gate results, DOM-reviewed | §0 Q10, G35, Wave 7f |

## 0.2 — Parity bar (Wargame B0.2 — this Spec must clear it)

Linux installable artifact **MATCH** (deb-first, the only 24.04-sandbox-aware default in category) · X11 auto-paste **BEAT** (in-process nut-js behind a verified-target ladder; no external inject tool) · Wayland auto-paste **DELIBERATELY PARTIAL** (honest floor; nobody has a sanctioned Wayland paste) · Wayland no-hotkey operation **BEAT** (hands-free VAD needs no compositor privilege) · paste safety **BEAT** (same ladder as Windows, session-gated) · kill-switch closes device **BEAT** · local transcription on Linux **DELIBERATELY PARTIAL** (cloud-first, honest row, optional later wave).

---

## 1. Scope

**In:** `build.linux` (deb primary + AppImage secondary) + `linux-package.yml` (dispatch/tags, cached, gates-first, headless launch-verify + nut-js load probe + hygiene); `check-workflows.mjs` generalization (all `*-package.yml`); `linux-session.ts` (env session detection, two-lock keystroke gating); `linux-window.ts` (xprop foreground read, pure parsers, `linux:` pseudo-hwnd, own-window PID+class precedence, liveness); `paste.ts` Linux terminal table (data only); executor chord mapping (Ctrl+V / Ctrl+Shift+V-for-terminals / Shift+Insert opt-in); electron-main Linux inject/yield wiring (additive); `pulse-audio.ts` + `capture.ts` pulse branch + runner audio smoke; guarded `uIOhook.start()` + `platform-caps` IPC + PTT-unavailable copy; focus grep-gate extension; human smoke scripts (X11 dictation/auto-paste, Wayland floor); README claim table + `docs/LINUX_GUIDE.md`.

**Out (deferred — PRD §9/§10):** any Wayland auto-paste backend (wtype/ydotool/overlay rejected; portal/libei = post-M7b); bundled local Whisper on Linux (optional follow-on wave under L-C8 + SHA-manifest law — not specced here); Flathub/snap/winget/brew; GPU/Parakeet; compositors beyond Ubuntu X11 + GNOME Wayland floor; any macOS re-scoping; static-FFmpeg bundling (deb `Depends` satisfies L-4).

**Config:** no new config keys, no migration — `CONFIG_VERSION` stays "4". PTT availability is runtime capability (IPC), not config.

---

## 2. Architecture delta

```
                 ┌──────────── BEFORE (post-7a) ────────────┐
 foreground:  getForegroundInfo(): win32 PS | darwin osascript | else null   ← linux falls out
 inject:      (win32|darwin) yield ladder + decidePaste + keyTap | else best-effort decidePaste, no verified target
 capture:     buildFfmpegContinuousArgs: darwin→avfoundation | else dshow    ← linux would pass dshow (broken)
 hotkey:      uIOhook.start() bare — would crash/undefined on Wayland
 packaging:   build.win + build.mac; ci.yml (win+linux tests) + mac-package.yml; NO linux artifact

                 ┌──────────── AFTER (M7b) ────────────┐
 SESSION GATE (two locks — LD4)
   linux-session.ts   detectSessionFromEnv: XDG_SESSION_TYPE > WAYLAND_DISPLAY > DISPLAY > unknown
        │             x11 → full path · wayland/unknown → foreground=null AND executor refuses keystroke
        ▼
 FOREGROUND (read-only, stock tooling — LD6)
   linux-window.ts    xprop _NET_ACTIVE_WINDOW → xprop -id WM_CLASS/_NET_WM_PID → /proc/<pid>/comm
        │             pseudo-hwnd linux:0x… · own-window = PID match ▸ WM_CLASS fallback (false-positive-safe)
        ▼
 LADDER (unchanged, pure — LD2)
   paste.ts           + Linux terminal table (WM_CLASS + comm names) — data only, no new variants
   yieldFocus.ts      untouched — decideYield consumes linux: targets like any other
        ▼
 EXECUTOR (electron-main, additive branch — LD1)
   session lock B → chord map: chat→Ctrl+V · terminal→Ctrl+Shift+V · variant→Shift+Insert
   yield = win.hide() + settle + strict linux:hwnd re-verify — NEVER activate (LD3, G30)
   guard fallback (own-window / unverified / alt-tab) → clipboard+toast — SAME semantics as Windows (DOM C1)

 CAPTURE (one branch — LD5/LD10)
   pulse-audio.ts     resolvePulseAudioInput: SPEAKFLOW_PULSE_AUDIO || "default"
   capture.ts         linux → -f pulse   (PulseAudio 22.04 ≡ PipeWire 24.04, verified F4)
                      ring buffer / VAD / mic-owner / kill-switch: untouched (#17/#19)

 HOTKEY (guarded — LD11)
   startHotkeyHook()  x11 → try uIOhook.start() · else PTT off, log, continue · hands-free unaffected
   platform-caps IPC  { session, pttAvailable, autoPaste } → renderer honesty copy

 PACKAGE FACTORY (LD8/LD9/LD13)
   package.json       build.linux: deb(primary: Depends ffmpeg,x11-utils,+electron defaults) + AppImage(caveat)
                      asarUnpack += @nut-tree-fork/libnut-linux
   linux-package.yml  dispatch/v* tags ONLY · cached · gates-before-package · apt-install-deb proof
                      xvfb launch-verify + [SPIKE] nut-js load probe (LD7 half 1) · hygiene · G31 audio smoke
   check-workflows    G27: every *-package.yml dispatch/tags-only (macOS rule untouched)
```

---

## 3. Module contracts — session + window

### 3.1 `src/utils/linux-session.ts` (new — Wave 7c, PURE + one memo)

Contract as resolved in §0 Q2. Exports: `LinuxSession`, `detectSessionFromEnv(env)` (pure), `getLinuxSession()` (memoized from `process.env`). Unit tests (G29, any OS): all four precedence branches; the XWayland tie (`WAYLAND_DISPLAY` + `DISPLAY` both set, no `XDG_SESSION_TYPE`) **must** resolve `wayland`; empty env → `unknown`.

### 3.2 `src/utils/linux-window.ts` (new — Wave 7c; mirrors `darwin-window.ts`)

```ts
import type { ForegroundInfo } from "./foreground-types.js";

// ── pure parsers (unit-tested on any OS — G29) ──────────────────────────────
/** "…window id # 0x3c00007" → "0x3c00007" (lowercased); "0x0"/none → null. */
export function parseActiveWindowId(stdout: string): string | null;

/** 'WM_CLASS = "instance", "Class"' → { instance, className } (lowercased); absent → null. */
export function parseWmClass(stdout: string): { instance: string; className: string } | null;

/** "_NET_WM_PID = 4242" → 4242; absent/NaN → null. */
export function parseNetWmPid(stdout: string): number | null;

/** Assembles ForegroundInfo: hwnd `linux:<windowId>`, className (WM_CLASS class part), processName (comm). */
export function toLinuxForegroundInfo(windowId: string, wmClass: { instance: string; className: string } | null, processName: string): ForegroundInfo;

/** Own-window: PID match (vs ownPid) takes precedence; WM_CLASS/instance token fallback
 *  ("oracle speakflow" | "oracle-speakflow" | "electron"). False-positive-safe (S-L12). */
export function isLinuxSpeakFlowWindow(pid: number | null, wmClass: { instance: string; className: string } | null, ownPid: number): boolean;

/** Strict re-verify: foreground.hwnd === expectHwnd (expectHwnd must start with "linux:"). */
export function linuxForegroundMatches(foreground: ForegroundInfo | null, expectHwnd: string): boolean;

// ── OS-touching wrappers (Linux-only at runtime; error paths return null/false) ──
/** Lock A lives here: returns null unless getLinuxSession() === "x11".
 *  xprop ×2 (3s timeouts) + /proc/<pid>/comm. Any failure → null + one stderr line. */
export function getLinuxForegroundInfo(): ForegroundInfo | null;

/** xprop -id <winId> exit 0 → alive. Mirrors isDarwinPriorTargetAlive. */
export function isLinuxPriorTargetAlive(expectHwnd: string): boolean;
```

`src/utils/win32-window.ts` (the existing platform-switch home) gains the `linux` arms in `getForegroundInfo()` and `getForegroundAndCheckWindow()` and re-exports `isLinuxSpeakFlowWindow`/`linuxForegroundMatches` — exactly how the darwin arms were added in 7a (additive; win32/darwin code paths byte-stable).

Own-window PID note: Chromium sets `_NET_WM_PID` from the browser process, so `process.pid` in the Electron main process is the correct comparand; if any sandbox/zygote arrangement breaks that equality, the WM_CLASS fallback catches it, and the failure direction of *both* checks is clipboard+toast (S-L12).

---

## 4. Module contracts — paste path

### 4.1 `src/services/paste.ts` (modified — Wave 7c, **data only**, LD2)

- `TERMINAL_CLASSES` += the 12 WM_CLASS entries from §0 Q6; `TERMINAL_PROCESSES` += the 11 comm-form names from §0 Q6. No logic change, no new `PasteDecision` variants, no OS imports. `classifyTarget` behavior for `linux:` inputs is covered by new unit cases (G29): gnome-terminal-server → terminal; `cursor`/`code`/`firefox` comm names → chat; null/empty → unknown.
- `decidePaste` unchanged — the muted→block gate (#19), own-window gate, strict `hwndMatches`, and `sameChatProcess` relaxation all operate on `linux:` pseudo-hwnds without modification. G29 asserts the full ladder against `linux:` fixtures (muted, own-window, mismatch, terminal/chat/unknown).

### 4.2 Executor chord mapping + inject wiring (`src/electron-main.ts` — Wave 7c, additive)

- **Platform guard extension:** the verified-target branch `if (platform === "win32" || platform === "darwin")` becomes a helper `hasVerifiedForegroundPath()` returning true for win32, darwin, and `linux && getLinuxSession() === "x11"`. Wayland/unknown Linux falls into the existing else-branch (null foreground → `decidePaste` → clipboardToast) — the floor by construction. Win32/darwin behavior byte-stable (LD1).
- **`isOwnWindowForeground`** gains: `if (platform === "linux") return isLinuxSpeakFlowWindow(pidFromInfo, wmClassFromInfo, process.pid)` — practically: `getLinuxForegroundInfo` embeds enough for the check, so the arm calls `isLinuxSpeakFlowWindow` with the parsed pid/class captured alongside the read (implementation may cache last-read pid/class module-locally in `linux-window.ts`; contract: the check never spawns extra processes beyond the read that produced the info).
- **`captureTargetHwnd` + 1 s poll:** include the linux-x11 arm so `recordExternalSample` feeds `decideYield` (the yield ladder then works unmodified with `linux:` targets).
- **Yield re-verify:** `verified = platform === "win32" ? hwnd equality : platform === "darwin" ? darwinForegroundMatches : linuxForegroundMatches(fg1, plan.expectHwnd)` — strict window-id equality (Q1).
- **Keystroke executor (Lock B + chord map):**
  ```ts
  if (process.platform === "linux" && getLinuxSession() !== "x11") {
    finalDecision = { action: "clipboardToast", reason: "non-X11 session — keystroke path locked" };
  }
  // ctrlV on linux: classifyTarget(postVerifyForeground) === "terminal" → Ctrl+Shift+V, else Ctrl+V
  // shiftInsert unchanged (opt-in variant; PRIMARY caveat documented)
  ```
- **Surgical budget:** ≤ **~150 net new lines** in `electron-main.ts` across Waves 7c+7e; overflow goes to `src/services/pipeline.ts` (M6 rule carried forward).
- **Guard-fallback semantics identical to Windows (DOM C1):** clipboard+toast fires only on muted-block, own-window, null/stale/dead target, post-yield mismatch, session lock, or keystroke exception — never as the designed happy path on a supported session. G32/G33 prove the happy path is the keystroke.

---

## 5. Module contracts — capture

### 5.1 `src/utils/pulse-audio.ts` (new — Wave 7d) + `src/services/capture.ts` (modified)

Exactly as resolved in §0 Q7 (resolver + two-line branch). Unit tests (G29/G31): `resolvePulseAudioInput` override/default; `buildFfmpegContinuousArgs` emits `-f pulse` on linux (args-builder is already exported-testable per the dshow/avf pattern — if not, export it for the test, no behavior change).

Invariants: #17 — FFmpeg remains the sole mic owner; the renderer never touches `getUserMedia` (no renderer change at all this milestone). #19 — kill-switch closes the FFmpeg device via the existing `captureSession.stop()`; zero new code, asserted by existing tests plus G29 `linux:` mute-ladder cases.

---

## 6. CI-runner policy (L-C6 / LD13 — normative, release-governing)

- **`linux-package.yml` runs on `workflow_dispatch` and `v*` tags ONLY.** Never `push`/`pull_request` (S-L4). Mechanized by **G27** (generalized `check-workflows.mjs`: every `*-package.yml` dispatch/tags-only) on every CI run — the rule is mechanical, not tribal, and now covers mac + linux + any future platform workflow with zero new code.
- **The existing macOS rule (G24) is untouched** — same file, same predicates, additive rule block (Q4).
- **Economics:** ubuntu-latest is the 1× baseline ($0.006/min, verified R8) but packaging jobs are 6–10 min, quota is shared with the whole private-repo test matrix, and agentic fix-loops through packaging workflows are the named failure mode (M6 W-9 class). Budget: **deliberate runs only; expected total across the milestone ≈ 3–6** (one per 7b iteration + one per release candidate). Windows+Linux `ci.yml` must be green before any dispatch.
- **Caching mandate:** npm + Electron + electron-builder caches on every run (Q3 keys) — no cold-download tax.
- **Hygiene (L-C9):** artifact step asserts no `.env`, no `/home/runner/` in user-facing metadata; artifacts distributed via Actions download → Drive link; repo stays private.
- **`ci.yml` is not modified** except that its existing `check:*` steps automatically pick up the extended G27/G30 rules. The ubuntu test lane continues to run the full unit/UI matrix — which now includes all Linux pure-logic tests on every push, free (G29 runs everywhere; parsers/session/table are OS-independent by design).

---

## 7. Platform-caps IPC (new — Wave 7e)

- `src/types/ipc.ts` += `PlatformCapsPayload = { platform: NodeJS.Platform; session: "x11" | "wayland" | "unknown" | null; pttAvailable: boolean; autoPaste: boolean }` (`session` null off-Linux; `autoPaste` = win32 ∨ darwin ∨ linux-x11).
- Channel `platform-caps` (main → renderer), sent once after `ready` and on renderer reload request. `src/preload.cts` exposes `onPlatformCaps` (guarded, CJS require pattern — invariant #10).
- Renderer: existing settings/status surface shows the PTT-unavailable line when `pttAvailable === false` (Q8 copy). No raw key material, no new component >250 lines (#16). Renderer never sees session internals beyond this enum.

---

## 8. Gate matrix — extends G1–G26 with **G27–G35**

G1–G26 inherited unchanged and blocking as before (Quantum Leap + M6). M7b adds:

| Gate | Type | Assertion | Command / method | Traces |
|---|---|---|---|---|
| **G27** | auto — **release-blocking**, every CI run | Every `*-package.yml` is dispatch/tags-only (no `pull_request`, no branch `push`); macOS G24 rule still passes untouched | `scripts/check-workflows.mjs` (extended) | LD13, L-C6, S-L4 |
| **G28** | auto — **release-blocking**, deliberate dispatch | deb builds; `apt-get install ./*.deb` resolves Depends on stock runner; app launches under `xvfb-run` + `TEST_MODE` (alive @10 s, state-machine marker, no FATAL); **`[SPIKE] nut-js load: OK`** (LD7 half 1); hygiene clean; AppImage best-effort | `linux-package.yml` launch-verify step (§0 Q3) | L-1, LD7/LD8/LD9/LD14, S-L7/S-L11 |
| **G29** | auto — blocking, every PR, any OS | Pure logic: session precedence (incl. XWayland tie→wayland), xprop parsers, own-window PID▸class precedence + false-positive direction, terminal table classification, full `decidePaste`/`decideYield` ladder with `linux:` fixtures (muted→block, own-window→toast, mismatch→toast) | `linux-session.test.ts`, `linux-window.test.ts`, `paste.test.ts` (ext) | LD2/LD4/LD5, S-L2/S-L12 |
| **G30** | auto — **hard floor**, every CI run | No `xdotool`/`wmctrl`/`XSetInputFocus(`/`windowactivate` (+ existing `SetForegroundWindow`/`AttachThreadInput`) in the paste-path file set incl. `linux-window.ts`/`linux-session.ts` | `scripts/check-focus-grep.mjs` (extended) | LD3, L-C3, S-L6, #18 |
| **G31** | auto — blocking, in `linux-package.yml` | FFmpeg reads ≥1 s of frames from a pulse null-source on the runner; **pre-authorized degrade:** device-enumeration assert if the runner can't host pulse (human smoke then carries L-4) | Q7 smoke step | L-4, LD10, S-L3, Assumption 3 |
| **G32** | **human — hard floor** | **L-2 X11 dictation smoke** (protocol §8.1): hands-free ≥8/10 auto-paste into Cursor + GNOME Terminal; PTT ≥4/5; **0 wrong-target (hard)**; own-window + alt-tab probes → clipboard+toast, 0 keystrokes; this run is **LD7 spike half 2** (first packaged XTest keystrokes) | `scripts/linux-x11-smoke.md` on Ubuntu 24.04 X11 (VM or contributor; 22.04 optional second run) | L-2, LD7/LD12, S-L11 |
| **G33** | **human — hard floor** | **L-3 auto-paste per supported session:** every README-supported row re-verified hands-free ≥8/10, 0 wrong-target (24.04 mandatory; 22.04 iff claimed). With an X11-only matrix, G33 = the G32 protocol executed once per claimed row | same script, per row | L-3, DOM C1, LD12 |
| **G34** | **human** — blocking | **Wayland floor smoke:** default GNOME Wayland session — hands-free speak → transcript on clipboard + toast; zero keystroke injections observed; PTT reported unavailable; kill-switch closes mic (indicator dark) | `scripts/linux-wayland-floor-smoke.md` | P-L4, S-L1/S-L10, #19; floor failure → block Linux release (falsification) |
| **G35** | **DOM review** — never cut | README claim table + Known Limitations + `LINUX_GUIDE.md` regenerated from actual gate results; only sessions with passed G32/G33 listed as supported | Wave 7f review | L-7, LD16 |

**Hard floors:** G30, and the **0-wrong-target** clause inside G32/G33 — one wrong-target paste or focus-steal-equivalent blocks the Linux release outright (PRD §4). **Release-blocking:** G27, G28. **Metric → gate coverage (no orphans):** L-1→G28 · L-2→G32 · L-3→G33 · L-4→G31+G32 · L-5→G30+G29(mute)+review · L-6→G25 (inherited, every PR) · L-7→G35.

### 8.1 Human smoke scripts (fixed protocols — written as files in Wave 7e/7f)

**`scripts/linux-x11-smoke.md` (G32/G33):**
1. **Setup:** fresh Ubuntu 24.04; pick **"Ubuntu on Xorg"** at login; verify `echo $XDG_SESSION_TYPE` → `x11`. Install the CI deb: `sudo apt install ./Oracle-SpeakFlow-*.deb` (must pull ffmpeg + x11-utils automatically — record it). Launch from the applications menu (packaged path only — no dev mode).
2. **Part A — hands-free auto-paste (primary, 10 utterances):** 5 into **Cursor** chat/editor field, 5 into **GNOME Terminal** prompt, focused before speaking. **Pass: ≥8/10 corrected text auto-pastes into the focused field; 0 wrong-target (hard).** Terminal utterances verify the Ctrl+Shift+V chord.
3. **Part B — guard probes (2, must NOT keystroke):** ① SpeakFlow window open **and focused** at dictation start → yield-or-clipboard, **0 pastes into SpeakFlow**, 0 wrong-target; ② alt-tab mid-utterance → clipboard+toast, no keystroke. Any keystroke on either probe = hard-floor breach.
4. **Part C — PTT backup (5 utterances):** hold the hotkey, speak, release — 3 Cursor / 2 GNOME Terminal. **Pass: ≥4/5 auto-paste, 0 wrong-target.** PTT-flaky-but-hands-free-green → PTT row scoped down (deferral #2), milestone continues.
5. **Triage on silence:** `pactl list sources short`, `SPEAKFLOW_VAD_DEBUG=1`, `SPEAKFLOW_PULSE_AUDIO` override (Q7 copy).
6. **Record:** per-utterance table (target, landed?, where), latency notes, session proof, deb-install log → pasted into the wave gate record. Repeat the full protocol on Ubuntu 22.04 X11 **only if** the 22.04 row will be claimed.

**`scripts/linux-wayland-floor-smoke.md` (G34):** default GNOME Wayland session (`XDG_SESSION_TYPE` → `wayland`); launch packaged app; speak hands-free with a text field focused → **expect** toast + transcript on clipboard, **no** text appears in the field, no focus change observed; verify the settings surface shows PTT unavailable; toggle kill-switch → mic indicator goes dark (device closed, #19); paste manually to confirm clipboard content. Clipboard write failing on Wayland → **block the Linux release** (falsification clause — the floor is the minimum viable product there).

---

## 9. Honest feasibility re-score (M7b scope)

| Criterion | Score /10 | Rationale |
|---|---|---|
| Safety-floor evidence (0 wrong-target; #18/#19) | 9 | Keystroke needs x11 session (two locks) **and** verified foreground (strict window-id equality) **and** the retained own-window gate; Wayland structurally unreachable; G30 mechanizes L-C3; mute path untouched pure logic re-asserted with `linux:` fixtures |
| Feasibility within milestone | 8 | Every mechanism is a proven pattern port (darwin-window→linux-window, avf→pulse, mac-package→linux-package); the one real unknown (packaged libnut-linux, Assumption 1) is spiked in the first wave's launch-verify + first smoke, with a named clipboard-floor fallback |
| Invariant compliance (#17–#19, L-C1…L-C10) | 9 | #17 by construction (one input-flag branch); #18 mechanized (G30 + hide-only yield); #19 untouched + G29; L-C6 mechanized (G27); L-C7 satisfied via X11 auto-paste + evidence-scoped matrix; L-C10 inherited (LD15) |
| Testability | 7 | Parsers/session/table/ladder pure and CI-tested on every OS; G28 launch-verify exceeds the mac equivalent; but G32/G33 remain human smokes on a real Linux desktop DOM does not own (VM or contributor) — the milestone's honest bottleneck, mitigated by Actions→Drive artifact flow |
| Economics / maintainability | 8 | Cheapest runner, cached, dispatch-only, gates generalized mechanically; two new small modules + one resolver + one workflow; X11-only matrix avoids the compositor support burden |
| Honest-claim readiness (L-7) | 9 | Every README row maps to a named gate; downgrades pre-authorized (deb-only, hands-free-first, 22.04-row-omitted, floor-only, no-claim); Wayland stated as a limitation, not a promise |

**Weighted ≈ 8.3 / 10 — passes ≥7.** Realistic outcome: deb artifact + X11 hands-free auto-paste + pulse capture + honest Wayland floor all land; the likeliest degradations are AppImage-row-caveat-only and PTT-row-scoped-down — neither breaches a floor.

## 9b. Adversarial re-review (pre-D1)

**1. Contradiction scan.** No path reaches a keystroke without `session === "x11"` AND a strictly-verified foreground AND the retained own-window gate (§0 Q2, §4.2) — consistent with the 0-wrong-target floor. No path activates a window (yield = hide-only; G30 forbids the Linux activation trio + xdotool/wmctrl wholesale). Clipboard+toast appears only behind guards — consistent with DOM C1 (the designed happy path on supported sessions is the keystroke, proven by G32/G33). No second mic handle (capture delta is one flag). No silent cloud (no transcription-surface changes; LD15). `paste.ts` receives data only. Win/mac branches byte-stable; the only shared-line edits are the platform-guard helper and the executor chord map, both covered by the existing G1–G26 matrix on every PR. **Consistent.**

**2. Weakest link + STOP trigger.** **`@nut-tree-fork/libnut-linux` in packaged Electron on Ubuntu (Assumption 1)** — the only load-bearing `cited-unverified` claim. Isolated as the LD7 embedded spike: half 1 (import loads) in the *first* G28 run; half 2 (XTest keystrokes land) in the *first* G32 smoke. STOP trigger: systemic failure at either half → halt, escalate to DOM; sanctioned downgrade = clipboard+toast on X11 too with the README scoped down — **never a mid-milestone engine swap** (PRD falsification, P-L2-dependency). Second-weakest: human-smoke logistics (a real X11 desktop) — mitigated by the Actions→Drive artifact path already proven for macOS, and by the fact that everything decision-shaped is CI-tested before any human minute is spent.

**3. Score holds at ≈8.3** post-review: both tail risks are spike-first with named, floor-preserving fallbacks, and the safety-critical logic is pure and gated (G29/G30) before any Electron wiring exists.

---

## 10. STOP-gated implementation waves 7b–7f & deferral order

No branch (`feat/m7b-linux-parity`) until D1 approval. Each wave ends at its gate(s); **STOP and report to DOM before the next.** Build may start same-day as D1 (INTENT §10).

### Wave 7b — Package factory (gates **G27 + G28**) — FIRST; embeds LD7 spike half 1
- **Deliverables:** `package.json` `build.linux` + `deb` blocks + `asarUnpack` libnut-linux; `linux-package.yml` (Q3 verbatim); `check-workflows.mjs` G27 extension; nut-js TEST_MODE load probe in `electron-main.ts` (additive, TEST_MODE+linux only); hygiene step.
- **STOP report:** G28 evidence (artifact list, install log, launch log incl. `[SPIKE] nut-js load: OK`).
- **Kill criteria:** deb **and** AppImage both unbuildable/unlaunchable → **STOP — viability falsification; no Linux claim, milestone halts at DOM** (PRD §4 P-L1). AppImage-only failure → deb-only, honest row (deferral #1). `[SPIKE] nut-js load: FAIL` → STOP, escalate (clipboard-floor downgrade is DOM's call, not the agent's).

### Wave 7c — Session + window + paste wiring (gates **G29 + G30**)
- **Deliverables:** `linux-session.ts`, `linux-window.ts` (+ unit tests in `src/utils/__tests__/`), `paste.ts` terminal table (+ test extension), `check-focus-grep.mjs` G30 extension, electron-main inject/yield wiring + chord map + Locks A/B (§4.2), `win32-window.ts` linux dispatch arms.
- **STOP report:** auto gates only (pure logic + grep + full inherited matrix green on win+linux runners).
- **Kill criteria:** cut nothing — this is the product. Any impulse to "fix" flaky focus with xdotool/wmctrl is a G30 breach, rejected in review (S-L6).

### Wave 7d — Capture (gate **G31**)
- **Deliverables:** `pulse-audio.ts`, `capture.ts` two-line branch, G31 smoke step in `linux-package.yml`, pactl triage copy drafted for the guide.
- **Kill criteria:** runner pulse infeasible → degrade G31 to enumeration assert (pre-authorized); human smoke carries L-4.

### Wave 7e — PTT + human X11 smokes (gates **G32 + G33** — hard floors; LD7 spike half 2)
- **Deliverables:** guarded `startHotkeyHook()` + `hookStarted` shutdown guards, `platform-caps` IPC + preload + renderer copy, `scripts/linux-x11-smoke.md`, fresh dispatch of `linux-package.yml` → artifact → Drive → smoke on Ubuntu 24.04 X11 (VM or contributor; 22.04 run optional per claimed rows).
- **STOP report:** full per-utterance smoke tables.
- **Kill criteria:** hands-free <8/10 after tuning → do **not** claim Linux supported; artifact stays "experimental — clipboard mode" (PRD §4 P-L2). **Any wrong-target paste → hard-floor breach, Linux release blocked outright.** PTT flaky but hands-free green → PTT row scoped down (deferral #2). Systemic keystroke failure (nut-js) → STOP, escalate per LD7.

### Wave 7f — Wayland floor + honesty (gates **G34 + G35**) — never cut
- **Deliverables:** `scripts/linux-wayland-floor-smoke.md` + executed G34 run; README claim table + Known Limitations regenerated from actual gate results; `docs/LINUX_GUIDE.md`; `CLAUDE.md` deltas (§11); CHANGELOG.
- **Kill criteria:** clipboard write itself broken on Wayland → block the Linux release entirely (falsification). Honesty pass is never cut.

**Deferral order (PRD §10 verbatim, first-cut-first):** ① AppImage target (deb-only, honest row) → ② PTT-on-X11 claim (hands-free-first) → ③ runner audio smoke (enumeration assert; human smoke carries L-4) → ④ terminal-table breadth (top terminals; unknown→clipboard keeps the tail safe).
**NEVER cut:** invariants #17–#19 gates, the 0-wrong-target floor, session gating of the keystroke path (Locks A/B), `*-package.yml` dispatch/tags discipline (G27), Windows+macOS non-regression (G25), the README honesty pass (G35).

---

## 11. File touch list

### New
| Path | Purpose | Wave | Gate |
|---|---|---|---|
| `src/utils/linux-session.ts` | env session detection; Lock A/B substrate | 7c | G29 |
| `src/utils/linux-window.ts` | xprop foreground read; pure parsers; `linux:` pseudo-hwnd; own-window; liveness | 7c | G29/G30 |
| `src/utils/__tests__/linux-session.test.ts` · `linux-window.test.ts` | pure-logic units (any OS) | 7c | G29 |
| `src/utils/pulse-audio.ts` | `SPEAKFLOW_PULSE_AUDIO` override / `default` source | 7d | G31 |
| `.github/workflows/linux-package.yml` | dispatch/tags-only package factory + launch-verify + spike probe + audio smoke + hygiene | 7b | G27/G28/G31 |
| `scripts/linux-x11-smoke.md` | G32/G33 fixed human protocol (10+2+5) | 7e | G32/G33 |
| `scripts/linux-wayland-floor-smoke.md` | G34 floor protocol | 7f | G34 |
| `docs/LINUX_GUIDE.md` | install / Xorg session / mic / auto-paste verify / PTT / troubleshooting | 7f | G35 |

### Modified
| Path | Change | Wave |
|---|---|---|
| `package.json` | `build.linux` + `deb.depends` (Q3 lists); `asarUnpack` += libnut-linux | 7b |
| `scripts/check-workflows.mjs` | G27: every `*-package.yml` dispatch/tags-only (additive rule; G24 predicates reused) | 7b |
| `scripts/check-focus-grep.mjs` | G30: +4 forbidden patterns, +2 checked files | 7c |
| `src/services/paste.ts` | Linux terminal table entries — **data only** | 7c |
| `src/services/__tests__/…paste tests` | `linux:` fixture cases (ladder + classifier + mute) | 7c |
| `src/utils/win32-window.ts` | linux arms in `getForegroundInfo`/`getForegroundAndCheckWindow`; re-exports | 7c |
| `src/electron-main.ts` | nut-js TEST_MODE probe (7b); `hasVerifiedForegroundPath` + linux own-window/capture/poll arms + Lock B + chord map (7c); `startHotkeyHook` + `hookStarted` + `platform-caps` send (7e). **≤ ~150 net new lines total; overflow → `src/services/pipeline.ts`** | 7b/7c/7e |
| `src/services/capture.ts` | pulse input-format + resolver branch (two lines) | 7d |
| `src/types/ipc.ts` + `src/preload.cts` | `PlatformCapsPayload` + `platform-caps` channel (guarded) | 7e |
| `README.md` | claim table rows + Known Limitations (regenerated from gates) | 7f |
| `CLAUDE.md` | see below | 7f |

### CLAUDE.md edits (Wave 7f) — exact intent
- **Environment:** "Windows 11 only (current scope)" → Windows 11 + macOS (beta) + **Linux: Ubuntu X11 via deb** (sessions per README claim table).
- **Dependency Notes:** add `xprop` (stock `x11-utils`, deb `Depends`) as the only sanctioned external foreground tool on Linux; note the Linux terminal chord mapping (terminal targets → Ctrl+Shift+V, executor-level); note `SPEAKFLOW_PULSE_AUDIO`.
- **Invariant #18 note:** Linux activation APIs (`xdotool`/`wmctrl`/`XSetInputFocus`) added to the mechanized forbidden set (G30).
- No new numbered invariant required — M7b operates entirely within #17–#19; the session gate is an implementation of #18's spirit, mechanized by G29/G30.

---

## 12. Gate D1 — STOP

**This is a Spec at implementation altitude. No code, no branch (`feat/m7b-linux-parity`), no CI dispatch until DOM approves:**
- the **supported-session matrix — X11 only** (Ubuntu 24.04 Xorg mandatory floor; 22.04 iff independently smoked; **Wayland unsupported for auto-paste** — ozone/XWayland evidence assessment §0 Q11, portal/libei deferred post-M7b),
- the **foreground/parser/pseudo-hwnd contracts** (xprop ×2 + `/proc/comm`, 3 s timeouts, `linux:0x…`, strict-equality re-verify, PID▸WM_CLASS own-window precedence) (§0 Q1, §3),
- the **session contract + two-lock keystroke gating** (XDG_SESSION_TYPE > WAYLAND_DISPLAY > DISPLAY; wayland/unknown → no keystroke by construction) (§0 Q2),
- the **`linux-package.yml` shape** (dispatch/tags, caches, gates-first, deb `Depends` list, apt-install proof, xvfb launch-verify assertions, **nut-js `[SPIKE]` probe**, AppImage best-effort + CI-only `--no-sandbox`, hygiene) (§0 Q3),
- the **G27 workflow-gate generalization** (all `*-package.yml`, macOS rule untouched) and **G30 focus-gate extension** (xdotool/wmctrl/XSetInputFocus/windowactivate + linux files) (§0 Q4/Q5),
- the **terminal table + executor chord map** (terminal→**Ctrl+Shift+V** on Linux; Shift+Insert variant stays opt-in with the PRIMARY caveat) (§0 Q6),
- the **pulse capture branch** (`SPEAKFLOW_PULSE_AUDIO`, default source, pactl triage, runner null-source smoke with pre-authorized enumeration degrade) (§0 Q7),
- the **uiohook guarded start + `platform-caps` IPC + PTT-unavailable copy** (§0 Q8, §7),
- the **gate matrix G27–G35** with G30 + 0-wrong-target hard floors and G27/G28 release-blocking, and the **two human smoke scripts** (10+2+5 X11 protocol with hands-free auto-paste ≥8/10 in Cursor + GNOME Terminal; Wayland floor protocol) (§8/§8.1),
- the **README claim table + Known Limitations + LINUX_GUIDE** honesty artifacts (§0 Q10, G35),
- the **feasibility re-score (≈8.3) + §9b adversarial re-review** (§9/§9b),
- the **five STOP-gated waves 7b–7f** (LD7 spike embedded in 7b/7c per the PRD), **deferral order**, and **file touch list** (§10–§11).

**On approval → Wave 7b (package factory, G27/G28) FIRST — its launch-verify is the nut-js packaged spike, half 1; a `[SPIKE] nut-js load: FAIL` or a dead deb = STOP + human escalation (clipboard-floor downgrade is pre-authorized wording, DOM's call). Until D1 approval: STOP. Do not implement.**

---

## 13. Handoff

**File produced:** `docs/DESIGN/M7_LINUX_PARITY_SPEC.md` (this document).
**Gate reached:** ✅ **D1 APPROVED (2026-07-09).** Resolves PRD §11 OQ 1–11 verbatim; honors LD1–LD16 and L-C1…L-C10; carries the L-C6/LD13 CI policy (§6); extends the gate matrix to G27–G35; sequences five STOP-gated waves 7b–7f.

`_Spec approved by DOM (Gate D1): YES — 2026-07-09_`
`_Amendments: none — Ctrl+Shift+V terminal chord, X11-only matrix, deb Depends list accepted as specced._`

**Next operator step — paste to the Sonnet-tier implementer (new session at repo root) ONLY AFTER DOM signs Gate D1:**

```
You are the implementer for Oracle SpeakFlow milestone M7b (Linux parity).
Spec (Gate D1) is approved. Implement per STOP-gated waves. Do not redesign.

READ FROM DISK FIRST:
1. docs/DESIGN/M7_LINUX_PARITY_SPEC.md   ← approved Spec — your contract (read ALL sections)
2. CLAUDE.md                             ← invariants #1–#19 (law — never violate)
3. docs/DESIGN/M7_LINUX_PARITY_PRD.md    ← PRD for context (what/why; DOM C1 auto-paste amendment)

RULES:
- Start with Wave 7b ONLY — package factory (build.linux + linux-package.yml + G27 + G28 launch-verify
  with the [SPIKE] nut-js load probe). STOP at G28. Do NOT open Wave 7c until DOM reviews the evidence.
  nut-js load FAIL or no launchable artifact → STOP + escalate (clipboard-floor downgrade is DOM's call).
- Each wave ends at its gate(s). STOP and report to DOM before the next wave.
- linux-package.yml = workflow_dispatch/v* tags ONLY (LD13/G27). NEVER on push/PR. ci.yml green first.
- Hard floors (breach blocks the milestone): G30 (no xdotool/wmctrl/XSetInputFocus/windowactivate/
  SetForegroundWindow/AttachThreadInput), and 0 wrong-target paste in G32/G33.
- Keystrokes require BOTH locks: getLinuxSession()==="x11" AND strictly verified foreground.
  Wayland/unknown sessions must never reach a keystroke. Hands-free MUST auto-paste on supported
  sessions (DOM C1) — clipboard+toast is guard-fallback only, never the designed happy path.
- paste.ts gets DATA ONLY (terminal table). Never OS calls or new variants in paste.ts.
  Linux terminal chord = Ctrl+Shift+V, mapped in the executor, not the ladder.
- Never violate #17 (FFmpeg sole mic owner), #18 (no focus steal — yield = win.hide() only),
  #19 (mute blocks everything). --no-sandbox is CI-verification-only, never in user docs.
- Report gate results honestly (PASS/FAIL + evidence). Do not paper over failures.
```
