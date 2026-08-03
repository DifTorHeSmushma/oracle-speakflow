// Pure finalize-delivery planner — no Electron, no native imports, no side effects.
// PRD-windows-dictation-delivery-brownfield §7 + issue #11 (Cursor / Electron hosts).
//
// LD1: speech-end captured HWND is delivery truth.
// LD2: long cloud STT must not invalidate delivery when SpeakFlow is foreground.
// LD4: preview is never a substitute for delivery.
// #11: Chromium/Electron hosts cannot use WM_PASTE — plan restoreAndKeystroke instead.
import type { ForegroundInfo, TargetClass, TargetClassifier } from "./paste.js";

export type DeliveryAction =
  /** Muted or kill-switch — Invariant #19. Nothing is delivered anywhere. */
  | { action: "block"; reason: string }
  /** Text stays on the clipboard; the user is told. Safety fallback only. */
  | { action: "clipboardToast"; reason: string }
  /** Deliver into the captured HWND without touching focus (win32 WM_PASTE — Notepad-class). */
  | { action: "backgroundPaste"; hwnd: string; reason: string }
  /**
   * Restore the captured HWND (narrow LD3 allowlist) then Ctrl+V / Shift+Insert.
   * Required for Electron/Cursor where WM_PASTE is a silent no-op (#11).
   */
  | { action: "restoreAndKeystroke"; hwnd: string; variant: "ctrlV" | "shiftInsert"; reason: string }
  /** The captured target already owns focus — a plain keystroke is enough. */
  | { action: "keystroke"; variant: "ctrlV" | "shiftInsert" }
  /** Non-win32: hide our window, let the captured target return, then re-verify. */
  | { action: "yieldThenVerify"; expectHwnd: string; settleMs: number };

export type DeliveryPlan = {
  primary: DeliveryAction;
  /** Executed only when `primary` fails to deliver. */
  fallback: DeliveryAction;
};

export type CapturedTarget = {
  info: ForegroundInfo;
  sampledAtMs: number;
} | null;

export type DeliveryInput = {
  muted: boolean;
  /** Window captured at speech end — delivery truth (LD1). */
  captured: CapturedTarget;
  /** Whether the captured HWND still exists. */
  capturedAlive: boolean;
  /** Foreground window observed at delivery time. */
  foreground: ForegroundInfo;
  /** True when SpeakFlow's own window is foreground (the LD2 case). */
  ownWindowIsForeground: boolean;
  nowMs: number;
  staleMs: number;
  terminalVariantEnabled: boolean;
  classifier: TargetClassifier;
  /** win32 only — WM_PASTE into a non-focused HWND (Notepad-class). */
  backgroundPasteSupported: boolean;
  /**
   * True when the captured host has a real Win32 edit child that accepts WM_PASTE.
   * False for Cursor / Electron / Chromium (#11). Caller computes via hostAcceptsBackgroundWmPaste.
   */
  hostAcceptsWmPaste: boolean;
  /** win32 only — narrow restore of the captured HWND is available (LD3). */
  restoreCapturedSupported: boolean;
  settleMs: number;
};

/** Stable, greppable reason for a captured target that carries no usable handle. */
export const EMPTY_CAPTURED_HWND_REASON = "delivery:empty-captured-hwnd";

const toast = (reason: string): DeliveryAction => ({ action: "clipboardToast", reason });

const keystrokeVariant = (
  targetClass: TargetClass,
  terminalVariantEnabled: boolean
): "ctrlV" | "shiftInsert" =>
  targetClass === "terminal" && terminalVariantEnabled ? "shiftInsert" : "ctrlV";

const keystrokeFor = (
  targetClass: TargetClass,
  terminalVariantEnabled: boolean
): DeliveryAction => ({
  action: "keystroke",
  variant: keystrokeVariant(targetClass, terminalVariantEnabled),
});

/**
 * Decides how the finalized transcript reaches the window the user spoke into.
 *
 * Ladder (top-down, first match wins):
 *   1. Muted                          → block
 *   2. No / empty / stale / dead target → clipboard+toast
 *   3. SpeakFlow is foreground:
 *        - hostAcceptsWmPaste → backgroundPaste
 *        - else restore supported → restoreAndKeystroke (Cursor / Electron)
 *        - else → yieldThenVerify (non-win32)
 *   4. Captured target is foreground  → keystroke
 *   5. Foreground drifted             → backgroundPaste or restoreAndKeystroke into capture
 *
 * Structural M2: `keystroke` is never emitted while ownWindowIsForeground is true.
 * `restoreAndKeystroke` is not a keystroke into SpeakFlow — it restores the captured target first.
 */
export const planDelivery = (input: DeliveryInput): DeliveryPlan => {
  const {
    muted,
    captured,
    capturedAlive,
    foreground,
    ownWindowIsForeground,
    nowMs,
    staleMs,
    terminalVariantEnabled,
    classifier,
    backgroundPasteSupported,
    hostAcceptsWmPaste,
    restoreCapturedSupported,
    settleMs,
  } = input;

  if (muted) {
    const blocked: DeliveryAction = { action: "block", reason: "muted" };
    return { primary: blocked, fallback: blocked };
  }

  if (!captured || !captured.info) {
    const only = toast("no capture target recorded");
    return { primary: only, fallback: only };
  }

  const capturedHwnd = captured.info.hwnd;
  if (!capturedHwnd) {
    const only = toast(EMPTY_CAPTURED_HWND_REASON);
    return { primary: only, fallback: only };
  }

  const ageMs = nowMs - captured.sampledAtMs;
  if (ageMs > staleMs) {
    const only = toast(`captured target stale (${ageMs}ms > ${staleMs}ms)`);
    return { primary: only, fallback: only };
  }

  if (!capturedAlive) {
    const only = toast("captured target window is gone");
    return { primary: only, fallback: only };
  }

  const targetClassForCapture = classifier(captured.info);
  const variant = keystrokeVariant(targetClassForCapture, terminalVariantEnabled);

  const restoreAction = (reason: string): DeliveryAction =>
    restoreCapturedSupported
      ? { action: "restoreAndKeystroke", hwnd: capturedHwnd, variant, reason }
      : toast(reason);

  const backgroundOrRestore = (wmReason: string, restoreReason: string): DeliveryAction => {
    if (backgroundPasteSupported && hostAcceptsWmPaste) {
      return { action: "backgroundPaste", hwnd: capturedHwnd, reason: wmReason };
    }
    return restoreAction(restoreReason);
  };

  // LD2 / #11 — SpeakFlow on top after long STT. Deliver into the captured target anyway.
  if (ownWindowIsForeground) {
    if (backgroundPasteSupported && hostAcceptsWmPaste) {
      return {
        primary: {
          action: "backgroundPaste",
          hwnd: capturedHwnd,
          reason: "SpeakFlow foreground — background paste into captured target",
        },
        // Electron-class should never reach here; if WM_PASTE somehow fails, restore next.
        fallback: restoreAction("background paste failed — restore captured target"),
      };
    }
    if (restoreCapturedSupported) {
      return {
        primary: {
          action: "restoreAndKeystroke",
          hwnd: capturedHwnd,
          variant,
          reason: "SpeakFlow foreground — restore captured Electron/chat target",
        },
        fallback: toast("restore+keystroke into captured target failed"),
      };
    }
    return {
      primary: { action: "yieldThenVerify", expectHwnd: capturedHwnd, settleMs },
      fallback: toast("post-yield foreground mismatch"),
    };
  }

  if (foreground && foreground.hwnd === capturedHwnd) {
    const targetClass = classifier(foreground);
    if (targetClass === "unknown") {
      const only = toast("unrecognized target — clipboard fallback");
      return { primary: only, fallback: only };
    }
    return {
      primary: keystrokeFor(targetClass, terminalVariantEnabled),
      fallback: backgroundOrRestore(
        "keystroke did not land — retry WM_PASTE into captured target",
        "keystroke did not land — restore captured target"
      ),
    };
  }

  // LD1 — never paste into "whatever is focused now"; go back to the captured target.
  return {
    primary: backgroundOrRestore(
      "foreground drifted from captured target",
      "foreground drifted — restore captured target"
    ),
    fallback: toast("foreground drifted from captured target"),
  };
};

/**
 * LD4 / #11 floor B — tray transcript preview must never stand in for a real paste.
 * Show only after the text actually reached the *external* target.
 */
export const shouldShowTranscriptPreview = (input: {
  delivered: boolean;
  hadLiveInsert: boolean;
}): boolean => input.delivered && !input.hadLiveInsert;
