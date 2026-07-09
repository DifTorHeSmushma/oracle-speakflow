// Pure paste-decision logic — no Electron/native imports (Spec §4.3 / Wargame S14 mitigation).
// The caller (Wave 2: electron-main) executes the actual keystroke.

export type PasteDecision =
  | { action: "ctrlV" }
  | { action: "shiftInsert" }
  | { action: "clipboardToast"; reason: string }
  | { action: "block"; reason: string };

export type ForegroundInfo = {
  hwnd: string;
  className: string;
  processName: string;
} | null;

export type TargetClass = "chat" | "terminal" | "unknown";
export type TargetClassifier = (info: ForegroundInfo) => TargetClass;

// Known terminal window classes (case-insensitive comparison below)
const TERMINAL_CLASSES = new Set([
  "consolewindowclass",
  "cascadia_hosting_window_class", // Windows Terminal
  "mintty",
  "virtualconsoleclass",
  "conemu",
  "conemubackgroundtaskbarlocalwindow",
]);

// Known terminal process names (lowercase for comparison)
const TERMINAL_PROCESSES = new Set([
  "cmd.exe",
  "powershell.exe",
  "pwsh.exe",
  "windowsterminal.exe",
  "wt.exe",
  "mintty.exe",
  "alacritty.exe",
  "conemu64.exe",
  "conemu.exe",
  "hyper.exe",
  "terminus.exe",
  "terminal.app",
  "iterm.app",
  "iterm2.app",
  "warp.app",
]);

/**
 * Built-in classifier. Returns "terminal" for known terminal hosts,
 * "unknown" for null/empty foreground, and "chat" for everything else
 * (browsers, IDEs, chat apps — all use standard Ctrl+V).
 */
export const classifyTarget: TargetClassifier = (info: ForegroundInfo): TargetClass => {
  if (!info || !info.processName) return "unknown";
  if (TERMINAL_CLASSES.has(info.className.toLowerCase())) return "terminal";
  if (TERMINAL_PROCESSES.has(info.processName.toLowerCase())) return "terminal";
  return "chat";
};

/**
 * Pure paste-decision ladder (Spec §4.3 — evaluated top-down).
 * Invariant #19: returns "block" whenever muted.
 * Invariant #18: never calls SetForegroundWindow — caller executes keystrokes only.
 */
export const decidePaste = (input: {
  capturedHwnd: string | null;
  capturedForeground?: ForegroundInfo;
  foreground: ForegroundInfo;
  ownHwndEquals: boolean;
  muted: boolean;
  terminalVariantEnabled: boolean;
  classifier: TargetClassifier;
}): PasteDecision => {
  const {
    capturedHwnd,
    capturedForeground = null,
    foreground,
    ownHwndEquals,
    muted,
    terminalVariantEnabled,
    classifier,
  } = input;

  // L12 — hard gate: zero pastes while muted (Invariant #19)
  if (muted) {
    return { action: "block", reason: "muted" };
  }

  // L2/L3 — guard checks: null target, own window, or HWND mismatch
  if (capturedHwnd === null) {
    return { action: "clipboardToast", reason: "no capture target recorded" };
  }
  if (ownHwndEquals) {
    return { action: "clipboardToast", reason: "SpeakFlow window is foreground" };
  }

  const hwndMatches = Boolean(foreground && capturedHwnd && foreground.hwnd === capturedHwnd);
  const sameChatProcess =
    Boolean(
      capturedForeground?.processName &&
        foreground?.processName &&
        capturedForeground.processName.toLowerCase() === foreground.processName.toLowerCase() &&
        classifier(capturedForeground) === "chat" &&
        classifier(foreground) === "chat"
    );

  if (!hwndMatches && !sameChatProcess) {
    if (!foreground || !capturedHwnd) {
      return { action: "clipboardToast", reason: "no capture target recorded" };
    }
    return { action: "clipboardToast", reason: "foreground window changed since record start" };
  }

  // L15 — classify target
  const targetClass = classifier(foreground);
  if (targetClass === "unknown") {
    return { action: "clipboardToast", reason: "unrecognized target — clipboard fallback" };
  }

  // L10 — Shift+Insert for terminal (opt-in, off by default)
  if (targetClass === "terminal" && terminalVariantEnabled) {
    return { action: "shiftInsert" };
  }

  // Default: standard Ctrl+V
  return { action: "ctrlV" };
};
