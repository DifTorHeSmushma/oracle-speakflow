# Windows Quality Regression Log

## Status: PHASE 0 IN PROGRESS
**Date:** 2026-07-16
**Reporter:** User (via Agent)

### Problem Description
Users on Windows 11 reporting significant degradation in transcription reliability and quality. The system is failing to meet the "reliable daily driver" bar.

### Reported Symptoms
1.  **Missing Start Words:** The first one or two words of almost every utterance are clipped.
2.  **Mid-Sentence Dropouts:** Words are missing from the middle of sentences, leading to fragmented output.
3.  **High Word Error Rate (WER):** Frequent misinterpretations of words even when captured.

### Evidence (Verbatim Example)
> "aspects. So we have the explainer video from the
> Count of us screen recording. And then I also want to introduce theSo this is the app.advice and then there is the... this...that the athlete bobs into and they can monitor their metrics.
> [BLANK_AUDIO]If there's various different aspects, I won't.Um,run through that and then demonstration and then we and then also share it some screenshots of theNow we'll cut share screenshots of the user interface or I could do an on-screen recording.with obvious of the main.What you suggest is the most suitable use case in this scenario given the data that I've commented upon."

### Phase 0 (approved 2026-07-16)
Spec: `docs/DESIGN/PHASE0_CAPTURE_DIAG_SPEC.md`

Enable: `SPEAKFLOW_CAPTURE_DIAG=1`

Artifacts under `%APPDATA%/oracle-speakflow/capture-diag/` (or Electron `userData/capture-diag/`):
- `{id}.raw.wav` / `{id}.gained.wav`
- `utterances.jsonl`

**No default gain/VAD/FFmpeg changes in Phase 0.**

### Next Steps
- [x] Phase 0 instrumentation (dual WAV + JSONL + lag/discard/clip/ring)
- [ ] Human reproduce with `SPEAKFLOW_CAPTURE_DIAG=1` and collect pack
- [ ] Apply split decision tree → Phase 1 one lever
- [ ] WASAPI only if Phase 0 proves dshow continuity failure after buffers
