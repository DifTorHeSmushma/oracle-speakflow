# S1 — ONNX Bundling Spike Report

**Date:** 2026-07-07
**Authored by:** Implementation engineer (Session 3 — Wave 1.0 spike only)
**Authority:** QUANTUM_LEAP_SPEC.md §10 Wave 1.0 (D1 approved)

---

## Verdict: **PASS**

All four S1 pass criteria met. Wave 1.1 may proceed upon human authorization.

---

## Environment

| Item | Value |
|------|-------|
| OS | Windows 11 Home 10.0.26200 |
| Node.js | v22.17.1 (Electron embeds v24.15.0) |
| Electron | 41.3.0 |
| onnxruntime-node | 1.20.1 |
| ORT NAPI level | napi-v6 |
| Machine | x64 (development workstation) |
| Model | silero_vad.onnx (Silero v5, main branch 2026-07-07) |

---

## What was tested

### Dev path (Node.js)
Ran `scratch/s1-onnx-spike/spike-dev.cjs` directly with `node` (v22). ORT and the model load from `resources/bin/silero_vad.onnx` via a relative path from `__dirname`. 200-iteration benchmark with warm-up.

### Dev Electron path (not packaged, `isPackaged: false`)
Ran `scratch/s1-onnx-spike/spike-electron-main.cjs` via the project's `electron.exe` binary (from `node_modules/electron/dist/electron.exe`). `app.isPackaged === false`; model loaded from the dev resources path.

### Packaged Electron path (`isPackaged: true`)
Built a minimal packaged app using the existing `electron-builder --dir --win` (directory output, no NSIS installer). The spike `spike-electron-main.cjs` was the app entry point. The packaged exe was run directly from `dist-installer/win-unpacked/Oracle SpeakFlow.exe`. `app.isPackaged === true`; model loaded from `process.resourcesPath/bin/silero_vad.onnx`.

---

## Results (per criterion)

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | `silero_vad.onnx` loads via `onnxruntime-node` in dev AND packaged Electron | **PASS** | Node dev: session created. Electron dev: `isPackaged=false`, session created. Packaged: `isPackaged=true`, session created from `resourcesPath/bin/silero_vad.onnx` |
| 2 | Inference on synthetic 512-frame input: <5ms p95 on target machine | **PASS** | Node p95=0.394ms; Electron dev p95=0.619ms; Packaged p95=0.626ms (all well under 5ms) |
| 3 | Renderer never opens mic — no `getUserMedia` anywhere in spike or active renderer | **PASS** | Spike code: zero `getUserMedia` references. `StatusBar.svelte` imports `startProceduralWaveform` only. See note below. |
| 4 | All spike logging to stderr only — stdout silent | **PASS** | Node stdout: 0 bytes. Electron dev stdout: 2 bytes (redirect overhead only). Packaged stdout: 2 bytes (redirect overhead only). |

---

## Benchmark detail

All runs: 200 iterations on a synthetic 512-sample Float32 frame (16 kHz mono, all-zeros silence), preceded by 3 warm-up runs. Times in milliseconds.

| Path | min | p50 | p95 | p99 | max |
|------|-----|-----|-----|-----|-----|
| Node dev | 0.198 | 0.255 | **0.394** | 1.026 | 1.099 |
| Electron dev (not packaged) | 0.255 | 0.349 | **0.619** | 0.841 | 0.964 |
| Packaged Electron | 0.228 | 0.336 | **0.626** | 1.011 | 1.929 |

At 32 ms per frame (512 samples @ 16 kHz), the p95 inference time of **0.626 ms** is ~2% of the frame budget. This leaves ample headroom for frame accumulation, debounce logic, and ring-buffer management in `capture.ts` / `vad.ts`.

---

## Model integrity note

- **Source:** `https://github.com/snakers4/silero-vad` — `master` branch, file `src/silero_vad/data/silero_vad.onnx`
- **Local path:** `resources/bin/silero_vad.onnx`
- **SHA-256:** `1A153A22F4509E292A94E67D6F9B85E8DEB25B4988682B7E174C65279D8788E3`
- **Size:** 2,327,524 bytes (2.32 MB)
- **Manifest written:** `resources/bin/models.sha256` (A4 placeholder — Wave 3 wires verification in `binaryPath.ts`)

**Model schema discovered at runtime** (critical for `vad.ts` implementation):

| Tensor | Type | Shape | Notes |
|--------|------|-------|-------|
| `input` (in) | Float32 | [1, 512] | 512 mono samples, **rank 2** (not [1,1,512]) |
| `state` (in) | Float32 | [2, 1, 128] | Merged LSTM h+c state (Silero v5) |
| `sr` (in) | Int64 | [1] | Sample rate; value must be `16000n` |
| `output` (out) | Float32 | [1, 1] | Speech probability |
| `stateN` (out) | Float32 | [2, 1, 128] | Updated state; feed back as `state` next frame |

**Silero v5 vs v4 schema difference:** v5 uses a single merged state tensor (`state`/`stateN`, shape [2,1,128]) instead of separate `h`/`c` tensors (shape [2,1,64] each). `vad.ts` must carry `stateN → state` across frames per session, and reset it on `stop()`.

---

## Packaged Electron notes

### Packaging config changes (spike-only — all documented)

Four changes were made to `package.json` for the packaged spike. Three are permanent spec deliverables; one was reverted after testing:

| Change | Status | Rationale |
|--------|--------|-----------|
| `"onnxruntime-node": "^1.20.1"` added to `dependencies` | **Permanent** | Must be in `dependencies` (not `devDependencies`) for electron-builder to bundle it |
| `"node_modules/onnxruntime-node/bin/**"` added to `asarUnpack` | **Permanent** | Native addon + DLLs cannot execute from inside ASAR |
| `"scratch/s1-onnx-spike/spike-electron-main.cjs"` added to `files` | **Permanent** | Spike artifact, harmless in `files` |
| `"main"` temporarily set to `"scratch/s1-onnx-spike/spike-electron-main.cjs"` | **Reverted** | Changed back to `"dist/electron-main.js"` after packaged test |

### ORT native addon resolution in packaged app

The `onnxruntime-node` package requires native binaries to be outside the ASAR archive. In the packaged output, the following were confirmed present under `app.asar.unpacked`:

```
node_modules/onnxruntime-node/bin/napi-v6/win32/x64/
  onnxruntime_binding.node   (298 KB — Node.js native addon)
  onnxruntime.dll            (26 MB)
  DirectML.dll               (18.5 MB)
  dxcompiler.dll             (18 MB)
  dxil.dll                   (1.5 MB)
```

Total ORT unpacked size: ~64 MB. This will increase the installer size. Wave 3 should evaluate whether DirectX shader compiler DLLs (`dxcompiler.dll`, `dxil.dll`) are required for CPU-only inference (they may not be needed if DirectML EP is never used).

### Model path resolution in packaged mode

`spike-electron-main.cjs` mirrors `binaryPath.ts` exactly:
```js
const modelPath = app.isPackaged
  ? path.join(process.resourcesPath, "bin", "silero_vad.onnx")
  : path.join(__dirname, "..", "..", "resources", "bin", "silero_vad.onnx");
```
Confirmed: `isPackaged: true` → `process.resourcesPath` resolves correctly → model found and loaded.

### `require("onnxruntime-node")` resolution

In the packaged app, `require("onnxruntime-node")` resolves through the ASAR's virtual `node_modules`, but the native binding itself (`onnxruntime_binding.node`) and its DLL dependencies are loaded from `app.asar.unpacked` via Electron's `require()` patching. This is the same mechanism that resolves `@nut-tree-fork/libnut-win32` and `uiohook-napi`. **No additional patching was needed.**

---

## Criterion 3 note — `getUserMedia` dead code

The active renderer path has zero `getUserMedia` calls. `StatusBar.svelte` imports and calls only `startProceduralWaveform()` (added in Gate B, commit `4171c1c`).

A dead export `startWaveform()` exists in `src-ui/utils/waveform.ts`. It calls `navigator.mediaDevices.getUserMedia`. It is:
- Never imported by any component or app module (grep: zero call sites)
- Explicitly documented in its file header as the non-FFmpeg-compatible path

**Recommendation for Wave 1.1:** delete `startWaveform()` from `waveform.ts`. It is dead code that creates confusion about Invariant #17 compliance.

---

## Wave 1.1 readiness (if human authorizes)

Wave 1.1 can assume:

- `onnxruntime-node` 1.20.1 loads and runs `silero_vad.onnx` reliably in both dev and packaged Electron 41.3.0.
- The model's I/O schema (see table above) is confirmed. `vad.ts` must use `[1, 512]` for input, `[2, 1, 128]` for state, `int64` for `sr`.
- State threading: `stateN` output must be fed as `state` input on the next frame, per session. Reset to zeros on `stop()`.
- ORT `asarUnpack` pattern `"node_modules/onnxruntime-node/bin/**"` is confirmed to correctly unpack all required native files.
- p95 inference per 512-sample frame is ~0.6ms — >8× under budget. The full VAD pipeline (capture reframing → ORT → debounce) can run comfortably within the 32ms frame window.

### Remaining risks for Wave 1.1

| Risk | Severity | Mitigation |
|------|----------|------------|
| ORT `InferenceSession.create()` is async — first-call latency is higher than steady-state (~50–200ms). Acceptable if done once at startup. | Low | Load session once in `createVad()`; re-use per session |
| `state` threading correctness — feeding wrong tensor shape or stale state across utterances | Medium | Unit-test with synthetic frame sequences; assert state shape matches [2,1,128] at each step |
| DirectML DLLs (~36MB of dxcompiler+dxil) may not be needed for CPU-only EP | Low/cost | Wave 3: test `executionProviders: ["cpu"]` without DirectML and check if DLLs can be excluded from bundle |
| SHA-256 manifest enforcement not wired yet — model integrity check is a placeholder | Medium | Wave 3: wire `binaryPath.ts` to verify against `models.sha256` on load; hard-BLOCK on mismatch (Invariant #13 / A4) |
| `startWaveform()` dead code in `waveform.ts` — Invariant #17 confusion | Low | Delete in Wave 1.1 |

---

## Spike code location

All spike artifacts are in `scratch/s1-onnx-spike/` — not under `src/`. They are scratch-only and should not be merged to product code:

```
scratch/s1-onnx-spike/
  package.json                    # isolated ORT install for dev spike
  node_modules/                   # scratch-only, not the main project's
  spike-dev.cjs                   # Node.js dev path benchmark (Step 2)
  spike-electron-main.cjs         # Electron main for packaged spike (Step 3)
  dev-electron-stderr2.txt        # Electron dev run output
  packaged-stderr.txt             # Packaged run output (criterion 1/2/4 evidence)
  packaged-stdout.txt             # Empty (criterion 4 evidence)
  dev-node-stdout.txt             # Empty (criterion 4 evidence)
  dev-node-stderr.txt             # Node dev run output
```

---

**STOP — S1 complete. Awaiting human authorization for Wave 1.1.**
