import { describe, it, expect } from "vitest";
import {
  decidePaste,
  classifyTarget,
} from "../src/services/paste.js";
import type { ForegroundInfo, TargetClassifier } from "../src/services/paste.js";

const HWND_A = "12345";
const HWND_B = "99999";

const foreground = (hwnd: string, processName = "Code.exe", className = "Chrome_WidgetWin_1"): ForegroundInfo => ({
  hwnd,
  processName,
  className,
});

const chatClassifier: TargetClassifier = () => "chat";
const terminalClassifier: TargetClassifier = () => "terminal";
const unknownClassifier: TargetClassifier = () => "unknown";

function base(overrides: Partial<Parameters<typeof decidePaste>[0]> = {}) {
  return decidePaste({
    capturedHwnd: HWND_A,
    foreground: foreground(HWND_A),
    ownHwndEquals: false,
    muted: false,
    terminalVariantEnabled: false,
    classifier: chatClassifier,
    ...overrides,
  });
}

describe("paste service — G10", () => {
  // ---------------------------------------------------------------------------
  // L12 hard gate: muted → block (Invariant #19)
  // ---------------------------------------------------------------------------

  it("muted=true → block", () => {
    const d = base({ muted: true });
    expect(d.action).toBe("block");
  });

  it("muted=true → block even when HWND matches", () => {
    const d = base({
      muted: true,
      capturedHwnd: HWND_A,
      foreground: foreground(HWND_A),
    });
    expect(d.action).toBe("block");
  });

  it("muted=true → block regardless of classifier", () => {
    const d = decidePaste({
      capturedHwnd: HWND_A,
      foreground: foreground(HWND_A),
      ownHwndEquals: false,
      muted: true,
      terminalVariantEnabled: true,
      classifier: terminalClassifier,
    });
    expect(d.action).toBe("block");
  });

  // ---------------------------------------------------------------------------
  // L2/L3 guard checks → clipboardToast
  // ---------------------------------------------------------------------------

  it("capturedHwnd=null → clipboardToast", () => {
    const d = base({ capturedHwnd: null });
    expect(d.action).toBe("clipboardToast");
  });

  it("ownHwndEquals=true → clipboardToast (SpeakFlow is foreground)", () => {
    const d = base({ ownHwndEquals: true });
    expect(d.action).toBe("clipboardToast");
  });

  it("foreground HWND mismatch across processes → clipboardToast", () => {
    const d = base({
      foreground: foreground(HWND_B, "Notepad.exe"),
      capturedForeground: foreground(HWND_A, "Cursor.exe"),
    });
    expect(d.action).toBe("clipboardToast");
  });

  it("same chat process with HWND drift → ctrlV (hands-free latency)", () => {
    const d = decidePaste({
      capturedHwnd: HWND_A,
      capturedForeground: foreground(HWND_A, "Cursor.exe"),
      foreground: foreground(HWND_B, "Cursor.exe"),
      ownHwndEquals: false,
      muted: false,
      terminalVariantEnabled: false,
      classifier: classifyTarget,
    });
    expect(d.action).toBe("ctrlV");
  });

  it("foreground=null → clipboardToast (foreground lost)", () => {
    const d = base({ foreground: null });
    expect(d.action).toBe("clipboardToast");
  });

  // ---------------------------------------------------------------------------
  // L15: unknown classifier → clipboardToast (never a blind keystroke)
  // ---------------------------------------------------------------------------

  it("unknown target → clipboardToast", () => {
    const d = base({ classifier: unknownClassifier });
    expect(d.action).toBe("clipboardToast");
  });

  // ---------------------------------------------------------------------------
  // L10: terminal + terminalVariantEnabled → shiftInsert
  // ---------------------------------------------------------------------------

  it("terminal + terminalVariantEnabled=true → shiftInsert", () => {
    const d = base({
      classifier: terminalClassifier,
      terminalVariantEnabled: true,
    });
    expect(d.action).toBe("shiftInsert");
  });

  it("terminal + terminalVariantEnabled=false → ctrlV (standard fallback)", () => {
    const d = base({
      classifier: terminalClassifier,
      terminalVariantEnabled: false,
    });
    expect(d.action).toBe("ctrlV");
  });

  // ---------------------------------------------------------------------------
  // Happy path: chat → ctrlV
  // ---------------------------------------------------------------------------

  it("chat target → ctrlV", () => {
    const d = base({ classifier: chatClassifier });
    expect(d.action).toBe("ctrlV");
  });

  it("default classifier chat window → ctrlV", () => {
    const d = base({ classifier: classifyTarget });
    expect(d.action).toBe("ctrlV");
  });

  // ---------------------------------------------------------------------------
  // Zero wrong-target guarantee (G10 invariant)
  // All non-block, non-toast results must only fire when HWND matches + not muted
  // ---------------------------------------------------------------------------

  it("ctrlV is never returned when muted", () => {
    const decisions = [
      base({ muted: true, classifier: chatClassifier }),
      base({ muted: true, classifier: terminalClassifier, terminalVariantEnabled: true }),
    ];
    for (const d of decisions) {
      expect(d.action).not.toBe("ctrlV");
      expect(d.action).not.toBe("shiftInsert");
    }
  });

  it("ctrlV is never returned when HWND mismatches across processes", () => {
    const d = decidePaste({
      capturedHwnd: HWND_A,
      capturedForeground: foreground(HWND_A, "Cursor.exe"),
      foreground: foreground(HWND_B, "Notepad.exe"),
      ownHwndEquals: false,
      muted: false,
      terminalVariantEnabled: false,
      classifier: chatClassifier,
    });
    expect(d.action).not.toBe("ctrlV");
    expect(d.action).not.toBe("shiftInsert");
  });

  // ---------------------------------------------------------------------------
  // classifyTarget built-in classifier
  // ---------------------------------------------------------------------------

  it("classifyTarget: null → unknown", () => {
    expect(classifyTarget(null)).toBe("unknown");
  });

  it("classifyTarget: empty processName → unknown", () => {
    expect(classifyTarget({ hwnd: "1", className: "", processName: "" })).toBe("unknown");
  });

  it("classifyTarget: cmd.exe → terminal", () => {
    expect(classifyTarget({ hwnd: "1", className: "ConsoleWindowClass", processName: "cmd.exe" })).toBe("terminal");
  });

  it("classifyTarget: powershell.exe → terminal", () => {
    expect(classifyTarget({ hwnd: "1", className: "Something", processName: "powershell.exe" })).toBe("terminal");
  });

  it("classifyTarget: WindowsTerminal.exe → terminal (process name)", () => {
    expect(classifyTarget({ hwnd: "1", className: "CASCADIA_HOSTING_WINDOW_CLASS", processName: "WindowsTerminal.exe" })).toBe("terminal");
  });

  it("classifyTarget: Code.exe → chat", () => {
    expect(classifyTarget({ hwnd: "1", className: "Chrome_WidgetWin_1", processName: "Code.exe" })).toBe("chat");
  });

  it("classifyTarget: unknown app → chat (permissive default for identified processes)", () => {
    expect(classifyTarget({ hwnd: "1", className: "SomeOtherClass", processName: "myapp.exe" })).toBe("chat");
  });

  // ---------------------------------------------------------------------------
  // Linux terminal table — className (WM_CLASS class part) and comm process names (G29 §0 Q6)
  // ---------------------------------------------------------------------------

  it("classifyTarget: gnome-terminal-server className → terminal", () => {
    expect(classifyTarget({ hwnd: "linux:0x1", className: "gnome-terminal-server", processName: "gnome-terminal-" })).toBe("terminal");
  });

  it("classifyTarget: gnome-terminal className → terminal", () => {
    expect(classifyTarget({ hwnd: "linux:0x1", className: "gnome-terminal", processName: "dbus-daemon" })).toBe("terminal");
  });

  it("classifyTarget: konsole className → terminal", () => {
    expect(classifyTarget({ hwnd: "linux:0x2", className: "konsole", processName: "konsole" })).toBe("terminal");
  });

  it("classifyTarget: kitty processName → terminal", () => {
    expect(classifyTarget({ hwnd: "linux:0x3", className: "", processName: "kitty" })).toBe("terminal");
  });

  it("classifyTarget: alacritty className → terminal", () => {
    expect(classifyTarget({ hwnd: "linux:0x4", className: "alacritty", processName: "alacritty" })).toBe("terminal");
  });

  it("classifyTarget: org.wezfurlong.wezterm className → terminal", () => {
    expect(classifyTarget({ hwnd: "linux:0x5", className: "org.wezfurlong.wezterm", processName: "wezterm-gui" })).toBe("terminal");
  });

  it("classifyTarget: cursor processName → chat (IDE on Linux)", () => {
    expect(classifyTarget({ hwnd: "linux:0x6", className: "cursor", processName: "cursor" })).toBe("chat");
  });

  it("classifyTarget: code processName → chat (VS Code on Linux)", () => {
    expect(classifyTarget({ hwnd: "linux:0x7", className: "code", processName: "code" })).toBe("chat");
  });

  it("classifyTarget: firefox processName → chat", () => {
    expect(classifyTarget({ hwnd: "linux:0x8", className: "firefox", processName: "firefox" })).toBe("chat");
  });

  // ---------------------------------------------------------------------------
  // decidePaste ladder with linux: pseudo-hwnds (G29 §4.1)
  // ---------------------------------------------------------------------------

  const LINUX_HWND = "linux:0x3c00007";

  function linuxBase(overrides: Partial<Parameters<typeof decidePaste>[0]> = {}) {
    return decidePaste({
      capturedHwnd: LINUX_HWND,
      foreground: { hwnd: LINUX_HWND, className: "cursor", processName: "cursor" },
      ownHwndEquals: false,
      muted: false,
      terminalVariantEnabled: false,
      classifier: chatClassifier,
      ...overrides,
    });
  }

  it("linux: muted → block (#19)", () => {
    expect(linuxBase({ muted: true }).action).toBe("block");
  });

  it("linux: own-window → clipboardToast", () => {
    expect(linuxBase({ ownHwndEquals: true }).action).toBe("clipboardToast");
  });

  it("linux: hwnd mismatch → clipboardToast", () => {
    expect(linuxBase({
      foreground: { hwnd: "linux:0x9999999", className: "kitty", processName: "kitty" },
      capturedForeground: { hwnd: LINUX_HWND, className: "cursor", processName: "cursor" },
    }).action).toBe("clipboardToast");
  });

  it("linux: capturedHwnd=null → clipboardToast", () => {
    expect(linuxBase({ capturedHwnd: null }).action).toBe("clipboardToast");
  });

  it("linux: terminal className + terminalVariantEnabled → shiftInsert", () => {
    expect(linuxBase({
      foreground: { hwnd: LINUX_HWND, className: "gnome-terminal", processName: "gnome-terminal-" },
      classifier: classifyTarget,
      terminalVariantEnabled: true,
    }).action).toBe("shiftInsert");
  });

  it("linux: chat target + hwnd match → ctrlV", () => {
    expect(linuxBase({ classifier: chatClassifier }).action).toBe("ctrlV");
  });

  it("linux: unknown target → clipboardToast", () => {
    expect(linuxBase({ classifier: unknownClassifier }).action).toBe("clipboardToast");
  });
});
