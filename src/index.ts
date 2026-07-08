import { uIOhook, UiohookKey } from "uiohook-napi";
import { loadConfig } from "./utils/config.js";
import { startRecording, type RecordingSession } from "./services/recorder.js";
import { transcribe } from "./services/transcription.js";
import { injectText } from "./services/injector.js";
import { isErr } from "./utils/result.js";

// ---------------------------------------------------------------------------
// State machine
// IDLE → RECORDING (hotkey DOWN + modifiers held)
// RECORDING → TRANSCRIBING (hotkey UP)
// TRANSCRIBING → INJECTING (transcription ok)
// INJECTING → IDLE (paste complete or any error)
// Any error mid-pipeline → IDLE (with log)
// ---------------------------------------------------------------------------
type State = "IDLE" | "RECORDING" | "TRANSCRIBING" | "INJECTING";

let state: State = "IDLE";
let activeSession: RecordingSession | null = null;

// CLAUDE.md invariant #3: API key never logged — always emit a fixed mask.
const MASKED_KEY = "sk-***";

const transition = (next: State) => {
  state = next;
};

const resetToIdle = () => {
  activeSession = null;
  transition("IDLE");
};

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------
const runPipeline = async (apiKey: string, model: string, language: string) => {
  if (!activeSession) return;
  const session = activeSession;

  // TRANSCRIBING
  transition("TRANSCRIBING");
  process.stdout.write("transcribing... ");

  const bufferResult = await session.stop();
  activeSession = null;

  if (isErr(bufferResult)) {
    console.error(`\nERROR [TRANSCRIBING]: Recording error — ${bufferResult.error.message}`);
    resetToIdle();
    return;
  }

  const textResult = await transcribe(apiKey, bufferResult.value, model, language);

  if (isErr(textResult)) {
    const { error } = textResult;
    switch (error.kind) {
      case "invalidApiKey":
        console.error(`\nERROR: Invalid API key (${MASKED_KEY}) — check your .env file`);
        break;
      case "networkTimeout":
        console.error(`\nERROR: Network timeout after retries — check your connection`);
        break;
      case "emptyTranscription":
        console.log(`(silence detected — nothing to paste)`);
        break;
      case "apiError":
        console.error(`\nERROR: Groq API ${error.statusCode} — ${error.message}`);
        break;
    }
    resetToIdle();
    return;
  }

  // INJECTING
  transition("INJECTING");
  process.stdout.write("pasting... ");

  const injectResult = await injectText(textResult.value);

  if (isErr(injectResult)) {
    const { error } = injectResult;
    switch (error.kind) {
      case "readOnlyTarget":
        console.error(`\nERROR: Target window is read-only — focus an editable field`);
        break;
      case "clipboardFailed":
        console.error(`\nERROR: Clipboard write failed — ${error.message}`);
        break;
      case "keystrokeFailed":
        console.error(`\nERROR: Keystroke failed — ${error.message}`);
        break;
    }
    resetToIdle();
    return;
  }

  const preview = textResult.value;
  console.log(`done.\n  > "${preview.slice(0, 72)}${preview.length > 72 ? "..." : ""}"`);
  resetToIdle();
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
const main = async () => {
  const configResult = loadConfig();
  if (isErr(configResult)) {
    console.error(
      "ERROR: GROQ_API_KEY not set.\n" +
      "  Add it to a .env file in this directory:\n" +
      "  GROQ_API_KEY=your_key_here\n" +
      "  Get a free key at: https://console.groq.com/\n" +
      "  Or set it as a Windows environment variable for startup-task use."
    );
    process.exit(1);
  }

  const { groqApiKey, model, language, hotkey } = configResult.value;

  const hotkeyLabel = [
    hotkey.ctrl  ? "Ctrl"  : null,
    hotkey.alt   ? "Alt"   : null,
    hotkey.shift ? "Shift" : null,
    `key:${hotkey.keycode}`,
  ].filter(Boolean).join("+");

  console.log(
    `Oracle SpeakFlow ready.\n` +
    `  API key: ${MASKED_KEY}\n` +
    `  Model:   ${model}\n` +
    `  Hotkey:  ${hotkeyLabel} — hold to record, release to transcribe & paste\n`
  );

  // --------------------------------------------------------------------------
  // Hotkey DOWN: IDLE → RECORDING
  // uiohook-napi embeds ctrlKey/shiftKey/altKey on every event — no manual tracking needed.
  // --------------------------------------------------------------------------
  uIOhook.on("keydown", (e) => {
    if (e.keycode !== hotkey.keycode) return;
    const modifiersMatch = (!hotkey.ctrl || e.ctrlKey) && (!hotkey.shift || e.shiftKey) && (!hotkey.alt || e.altKey);
    if (!modifiersMatch) return;

    // CLAUDE.md invariant #6: only transition from IDLE — silently drop key-repeat
    // events that fire during RECORDING, TRANSCRIBING, or INJECTING phases.
    if (state !== "IDLE") return;

    transition("RECORDING");
    process.stdout.write("  [REC] Recording... ");

    const result = startRecording();
    if (isErr(result)) {
      const { error } = result;
      switch (error.kind) {
        case "permissionDenied":
          console.error(`\nERROR: Microphone permission denied — ${error.message}`);
          break;
        case "deviceNotFound":
          console.error(`\nERROR: Audio device not found — is SoX installed? (winget install sox.sox)`);
          break;
        case "recordingFailed":
          console.error(`\nERROR: Recording failed — ${error.message}`);
          break;
      }
      resetToIdle();
      return;
    }

    activeSession = result.value;
  });

  // --------------------------------------------------------------------------
  // Hotkey UP: RECORDING → pipeline
  // No modifier check on keyup — Ctrl/Shift may already be released.
  // The state machine is the guard.
  // --------------------------------------------------------------------------
  uIOhook.on("keyup", (e) => {
    if (e.keycode !== hotkey.keycode) return;
    if (state !== "RECORDING") return;

    // Fire-and-forget; pipeline manages its own state transitions.
    runPipeline(groqApiKey, model, language).catch((err: unknown) => {
      console.error(`\nFATAL: Unexpected pipeline error —`, err);
      resetToIdle();
    });
  });

  uIOhook.start();

  // --------------------------------------------------------------------------
  // Graceful shutdown: stop any in-flight recording before exit.
  // CLAUDE.md invariant #8: always await stop() via .finally() before exit.
  // --------------------------------------------------------------------------
  process.on("SIGINT", () => {
    console.log("\nShutting down Oracle SpeakFlow...");
    uIOhook.stop();

    if (activeSession) {
      activeSession.stop().finally(() => process.exit(0));
    } else {
      process.exit(0);
    }
  });
};

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
