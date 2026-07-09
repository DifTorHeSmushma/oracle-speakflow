# M6 Wave 1.0 — Local Residency + Bundling Spike Report

**Gate:** S1-M6
**Status:** ❌ FAIL — C2 latency gate missed (p95=5213ms > 800ms). Escalate to DOM before Wave 1.1.

**Reference:** M6_PUBLIC_LAUNCH_SPEC.md §10 Wave 1.0

---

## 1. Purpose

This spike proves (or disproves) the two technical unknowns that block Wave 1.1:

1. **Bundling:** `whisper-cli.exe`, `whisper-server.exe`, `ggml-tiny.en.bin` work via `extraResources` in both dev and packaged Electron.
2. **Resident latency:** `whisper-server` holding `ggml-small.en-q5_1.bin` warm delivers capture-end→text **≤ 800 ms p95** on DOM's reference hardware.

If either fails, the PRD §3 P2 named fallback applies: Fast/batch stays the default; Balanced/Accurate ship as opt-in with honest latency copy. No silent pivot.

---

## 2. Pre-conditions: binaries to place in `resources/bin/`

Place these four files before running the probe. None are committed (sizes too large; `.gitkeep` holds the dir):

| File | Size | Source |
|---|---|---|
| `whisper-cli.exe` | ~10 MB | whisper.cpp GitHub Releases (Windows x64 zip) |
| `whisper-server.exe` | ~10 MB | Same zip as above |
| `ggml-tiny.en.bin` | 77.7 MB | `huggingface.co/ggerganov/whisper.cpp` |
| `ggml-small.en-q5_1.bin` | ~190 MB | `huggingface.co/ggerganov/whisper.cpp` |

Any runtime DLLs required by the whisper.cpp binaries (e.g., `ggml.dll`) also go in `resources/bin/`.

### SHA-256 verification

After placing the model files, compute their SHA-256 hashes:

```powershell
Get-FileHash resources\bin\ggml-tiny.en.bin -Algorithm SHA256
Get-FileHash resources\bin\ggml-small.en-q5_1.bin -Algorithm SHA256
```

Record the hashes in §3.0 below. These will populate `resources/bin/models.sha256` in Wave 1.1 (G14).

---

## 3. Pass criteria (ALL four required for S1-M6 PASS)

| # | Criterion | Method |
|---|---|---|
| C1 | `whisper-cli.exe` + `whisper-server.exe` + `ggml-tiny.en.bin` load and transcribe in **dev AND packaged** Electron, offline | probe.mjs C1 (dev) + manual packaged smoke |
| C2 | Resident `whisper-server` warm with `ggml-small.en-q5_1.bin`: **p95 ≤ 800 ms** on reference hardware | probe.mjs C2 latency report |
| C3 | `stopEngine` pattern: idempotent double-kill returns cleanly; engine killed on quit; no zombie; idle-unload design confirmed | probe.mjs C3 |
| C4 | All spike logging to **stderr only** (MCP-transport discipline) | probe.mjs C4 self-check |

---

## 4. How to run

```powershell
# From project root — after placing binaries in resources/bin/
node scratch/spike-s1-m6/probe.mjs 2>&1 | Tee-Object -FilePath scratch/spike-s1-m6/probe-output.txt
```

All output goes to stderr. Redirect and tee to review the full log. stdout must remain empty (verify with `node scratch/spike-s1-m6/probe.mjs > scratch/spike-s1-m6/stdout-check.txt` — the file should be empty).

### Packaged Electron smoke (C1 packaged half)

```powershell
npm run package
# Launch dist-installer/Oracle SpeakFlow Setup *.exe on a clean machine or VM
# Enable local mode, speak a sentence with network disabled
# Verify text pastes correctly
```

---

## 5. Results

> **Completed 2026-07-08 on DOM reference hardware (ASUS TUF A15 FA506II).**

### 5.0 SHA-256 hashes (record before C1 test)

```
ggml-tiny.en.bin:          921E4CF8686FDD993DCD081A5DA5B6C365BFDE1162E72B08D75AC75289920B1F
ggml-small.en-q5_1.bin:    BFDFF4894DCB76BBF647D56263EA2A96645423F1669176F4844A1BF8E478AD30
```

Binaries sourced: whisper.cpp v1.9.1 `whisper-bin-x64.zip` (GitHub); models from `huggingface.co/ggerganov/whisper.cpp`.

### 5.1 C1 — Binary presence (dev mode)

Probe stdout check (must be empty):
```
(empty — stdout-check.txt is 0 bytes)
```

Dev mode binary probe:
```
--- Criterion 1: Binary presence (dev mode) ---
  OK   cli: ...\resources\bin\whisper-cli.exe
  OK   server: ...\resources\bin\whisper-server.exe
  OK   tiny: ...\resources\bin\ggml-tiny.en.bin
  OK   small: ...\resources\bin\ggml-small.en-q5_1.bin

--- whisper-cli version sanity ---
  output (first line): whisper.cpp version: 1.9.1
  exit code: 0
```

**C1 dev result:** [x] PASS / [ ] FAIL

### 5.2 C1 — Packaged Electron smoke

Hardware: ASUS TUF Gaming A15 FA506II  OS: Windows 11 Home 10.0.26200  Network: [x] Disabled (binary-level test)

Steps performed:
- [x] `npm run package` completed without error (`dist-installer/Oracle SpeakFlow Setup 0.1.0.exe`)
- [ ] Installer launched on clean machine/VM (not run — used `win-unpacked` directly)
- [ ] Local mode enabled in app (GUI smoke deferred)
- [ ] Spoke test utterance (GUI smoke deferred)
- [ ] Text pasted correctly in target window (GUI smoke deferred)

Packaged binary verification (offline):
- All 20 files present in `dist-installer/win-unpacked/resources/bin/` (whisper-cli, whisper-server, both models, DLLs).
- `whisper-cli.exe` from packaged path transcribed 1s test WAV via `ggml-tiny.en.bin` in 680ms total (CPU-only, offline).

Observation: **Packaged extraResources bundling works.** Full GUI speak→paste smoke not executed in this automated run; recommend DOM quick manual pass before public release. C1 packaged binary layer: PASS.

**C1 packaged result:** [x] PASS (binary layer) / [ ] FAIL — *GUI speak/paste: pending DOM manual*

### 5.3 C2 — Resident engine latency

Reference hardware: ASUS TUF A15 FA506II  CPU: AMD Ryzen 7 4800H (8C/16T)  RAM: 16 GB

```
Model: ggml-small.en-q5_1.bin  Budget: ≤800ms p95
Ephemeral port: 55812
Ready in 594ms (server startup to /health 200)
Warm-up: status=200  text={"text":" [BLANK_AUDIO]\n"}

Running 10 warm inference iterations (3.0s mono 16kHz WAV per request):
 [ 1/10] 4836ms  status=200
 [ 2/10] 4825ms  status=200
 [ 3/10] 5213ms  status=200
 [ 4/10] 4969ms  status=200
 [ 5/10] 5062ms  status=200
 [ 6/10] 4767ms  status=200
 [ 7/10] 4812ms  status=200
 [ 8/10] 4652ms  status=200
 [ 9/10] 5049ms  status=200
 [10/10] 4978ms  status=200

=== Latency Report (N=10) ===
min=4652ms  p50=4836ms  mean=4916ms  p95=5213ms  max=5213ms
Raw: [4836, 4825, 5213, 4969, 5062, 4767, 4812, 4652, 5049, 4978]
Budget (≤800ms p95): FAIL (p95=5213ms > 800ms)
```

| Metric | Value |
|---|---|
| min | 4652 ms |
| p50 | 4836 ms |
| mean | 4916 ms |
| **p95** | **5213 ms** |
| max | 5213 ms |
| Budget | ≤ 800 ms |
| Server startup (/health) | 594 ms |
| Backend | CPU-only (ggml-cpu-haswell.dll); no GPU |

**Analysis:** Probe uses 3.0s audio per inference. Latency tracks ~1.6× realtime on this CPU — consistent across all 10 runs. `--threads 4` (probe default). Tuning to `--threads 8` not attempted (per gate: escalate before pivot).

**C2 result:** [ ] PASS (p95 ≤ 800ms) / [x] FAIL (p95 = 5213ms)

### 5.4 C3 — Idempotent stop + zombie

```
Sending first SIGKILL to PID 28532...
kill #1 returned: true
Sending second SIGKILL (must not throw)...
OK: kill #2 returned: false (idempotent — Node.js ChildProcess.kill is safe to call twice)
Zombie check: attempting to bind the same port again...
OK: second whisper-server started cleanly — no zombie from kill #1
```

- [x] kill #1 returned without throwing
- [x] kill #2 returned without throwing (idempotent)
- [x] Second server started cleanly on same port (no zombie)

**C3 result:** [x] PASS / [ ] FAIL

### 5.5 C4 — Stderr-only

- [x] `stdout-check.txt` is empty (zero bytes)

**C4 result:** [x] PASS / [ ] FAIL

---

## 6. Gate S1-M6 verdict

| Criterion | Result |
|---|---|
| C1 Binary presence (dev + packaged) | **PASS** (dev ✅; packaged binary layer ✅; GUI speak/paste pending DOM manual) |
| C2 Latency p95 ≤ 800ms | **FAIL** — p95=5213ms (6.5× over budget) |
| C3 Idempotent stop / no zombie | **PASS** |
| C4 Stderr-only | **PASS** |
| **S1-M6** | **[ ] PASS — Wave 1.1 authorized** / **[x] FAIL — escalate to DOM** |

### DOM escalation (C2 failure — named fallback)

Per Spec §10 / PRD §3 P2, **do not start Wave 1.1** until DOM authorizes with an explicit decision:

1. **Accept Fast-default/batch fallback:** Default tier = Fast (`ggml-tiny.en.bin` via `whisper-cli` batch). Balanced/Accurate ship as opt-in with honest latency copy. Resident `whisper-server` only for tiers where hardware meets budget (or defer residency to M7).
2. **Tune first:** Re-run probe with `--threads 8`, `--beam-size 1`, `--best-of 1` — unlikely to close 5213→800ms gap on 3s audio without shorter clips or GPU.
3. **Replan:** Defer resident Balanced default to M7; target Apple Silicon / GPU paths separately.

**Recommendation:** Option 1 (Fast-default/batch). Measured p95 on reference hardware is ~5s for 3s Balanced resident inference — far beyond the 800ms gate. Bundling and kill semantics are proven; residency latency is not.

---

## 7. If S1-M6 FAILS

Per Spec §10 Wave 1.0 and PRD §3 P2 — **named fallbacks in order, no silent pivot:**

1. **Tune:** try `--threads 8`, `--best-of 1`, `--beam-size 1` on whisper-server to reduce p95 latency.
2. **Fallback to Fast-default/batch:** `Fast (ggml-tiny.en.bin)` stays the default via `spawnSync` (the existing path). Balanced/Accurate ship as opt-in with honest latency copy explaining cold-start cost.
3. **Replan:** escalate to DOM with measured p95 values and hardware specs; DOM decides whether to defer resident engine to M7 or target different quantization.

**Hard rule:** do not start Wave 1.1 until DOM authorizes via this gate document.

---

## 8. Handoff

**After S1-M6 PASS:** Present this completed document to DOM. On DOM authorization, proceed to **Wave 1.1** (pure services: `modelRegistry.ts`, `modelDownloader.ts`, `localEngine.ts`, `foregroundTracker.ts`, `yieldFocus.ts`, `migrateConfigV4`, `models.sha256` 3-entry manifest, `scripts/check-manifest.mjs`).
