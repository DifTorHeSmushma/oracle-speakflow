import { describe, it, expect } from "vitest";
import {
  planDelivery,
  shouldShowTranscriptPreview,
  EMPTY_CAPTURED_HWND_REASON,
  type DeliveryAction,
  type DeliveryInput,
} from "../delivery.js";
import { classifyTarget, type ForegroundInfo } from "../paste.js";
import { hostAcceptsBackgroundWmPaste } from "../../utils/win32-paste-hwnd.js";

const NOTEPAD: ForegroundInfo = {
  hwnd: "123456",
  className: "Notepad",
  processName: "notepad.exe",
};

const CURSOR: ForegroundInfo = {
  hwnd: "777777",
  className: "Chrome_WidgetWin_1",
  processName: "Cursor.exe",
};

const EXPLORER: ForegroundInfo = {
  hwnd: "999999",
  className: "CabinetWClass",
  processName: "explorer.exe",
};

const TERMINAL: ForegroundInfo = {
  hwnd: "123456",
  className: "CASCADIA_HOSTING_WINDOW_CLASS",
  processName: "WindowsTerminal.exe",
};

const NOW = 1_000_000;

const baseInput = (overrides: Partial<DeliveryInput> = {}): DeliveryInput => ({
  muted: false,
  captured: { info: NOTEPAD, sampledAtMs: NOW - 5_000 },
  capturedAlive: true,
  foreground: NOTEPAD,
  ownWindowIsForeground: false,
  nowMs: NOW,
  staleMs: 45_000,
  terminalVariantEnabled: false,
  classifier: classifyTarget,
  backgroundPasteSupported: true,
  hostAcceptsWmPaste: true,
  restoreCapturedSupported: true,
  settleMs: 350,
  ...overrides,
});

const actions = (input: DeliveryInput): DeliveryAction[] => {
  const plan = planDelivery(input);
  return [plan.primary, plan.fallback];
};

describe("hostAcceptsBackgroundWmPaste", () => {
  it("accepts Notepad-class hosts", () => {
    expect(hostAcceptsBackgroundWmPaste(NOTEPAD)).toBe(true);
  });

  it("rejects Cursor / Electron Chromium shells (issue #11)", () => {
    expect(hostAcceptsBackgroundWmPaste(CURSOR)).toBe(false);
    expect(
      hostAcceptsBackgroundWmPaste({
        className: "Chrome_WidgetWin_1",
        processName: "code.exe",
      })
    ).toBe(false);
  });
});

describe("planDelivery — G-D1 delivery into the captured target", () => {
  it("delivers into the captured HWND in the background when SpeakFlow is foreground (Notepad)", () => {
    const plan = planDelivery(baseInput({ ownWindowIsForeground: true, foreground: null }));

    expect(plan.primary).toEqual({
      action: "backgroundPaste",
      hwnd: NOTEPAD.hwnd,
      reason: expect.stringContaining("background paste"),
    });
  });

  it("restores Cursor when SpeakFlow is foreground (issue #11 — never WM_PASTE Electron)", () => {
    const plan = planDelivery(
      baseInput({
        captured: { info: CURSOR, sampledAtMs: NOW - 5_000 },
        foreground: null,
        ownWindowIsForeground: true,
        hostAcceptsWmPaste: false,
      })
    );

    expect(plan.primary).toEqual({
      action: "restoreAndKeystroke",
      hwnd: CURSOR.hwnd,
      variant: "ctrlV",
      reason: expect.stringContaining("restore"),
    });
    expect(plan.primary.action).not.toBe("backgroundPaste");
  });

  it("restores Cursor when foreground drifted away from the captured chat", () => {
    const plan = planDelivery(
      baseInput({
        captured: { info: CURSOR, sampledAtMs: NOW - 5_000 },
        foreground: EXPLORER,
        hostAcceptsWmPaste: false,
      })
    );

    expect(plan.primary).toMatchObject({
      action: "restoreAndKeystroke",
      hwnd: CURSOR.hwnd,
    });
  });

  it("uses a plain keystroke when the captured target already owns focus", () => {
    const plan = planDelivery(baseInput());

    expect(plan.primary).toEqual({ action: "keystroke", variant: "ctrlV" });
  });

  it("uses Shift+Insert for a focused terminal target when the variant is enabled", () => {
    const plan = planDelivery(
      baseInput({ foreground: TERMINAL, terminalVariantEnabled: true })
    );

    expect(plan.primary).toEqual({ action: "keystroke", variant: "shiftInsert" });
  });

  it("keeps 10 consecutive Cursor restore plans identical (M1 10/10 for Electron host)", () => {
    const plans = Array.from({ length: 10 }, (_, i) =>
      planDelivery(
        baseInput({
          captured: { info: CURSOR, sampledAtMs: NOW - 5_000 },
          ownWindowIsForeground: true,
          foreground: null,
          hostAcceptsWmPaste: false,
          nowMs: NOW + i * 100,
        })
      )
    );

    for (const plan of plans) {
      expect(plan.primary).toMatchObject({
        action: "restoreAndKeystroke",
        hwnd: CURSOR.hwnd,
      });
    }
  });
});

describe("planDelivery — G-D2 never sends a keystroke into SpeakFlow's own window", () => {
  it("emits no keystroke action across every input combination while SpeakFlow is foreground", () => {
    const foregrounds: ForegroundInfo[] = [null, NOTEPAD, EXPLORER, TERMINAL, CURSOR];
    let combinations = 0;

    for (const muted of [false, true]) {
      for (const capturedAlive of [false, true]) {
        for (const backgroundPasteSupported of [false, true]) {
          for (const hostAcceptsWmPaste of [false, true]) {
            for (const restoreCapturedSupported of [false, true]) {
              for (const terminalVariantEnabled of [false, true]) {
                for (const foreground of foregrounds) {
                  for (const ageMs of [0, 5_000, 120_000]) {
                    combinations += 1;
                    const input = baseInput({
                      muted,
                      capturedAlive,
                      backgroundPasteSupported,
                      hostAcceptsWmPaste,
                      restoreCapturedSupported,
                      terminalVariantEnabled,
                      foreground,
                      ownWindowIsForeground: true,
                      captured: { info: NOTEPAD, sampledAtMs: NOW - ageMs },
                    });

                    for (const action of actions(input)) {
                      expect(action.action).not.toBe("keystroke");
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    expect(combinations).toBeGreaterThan(500);
  });
});

describe("planDelivery — safety gates and degradations", () => {
  it("blocks everything while muted", () => {
    for (const action of actions(baseInput({ muted: true }))) {
      expect(action).toEqual({ action: "block", reason: "muted" });
    }
  });

  it("degrades to clipboard when no target was captured", () => {
    for (const action of actions(baseInput({ captured: null }))) {
      expect(action).toEqual({
        action: "clipboardToast",
        reason: "no capture target recorded",
      });
    }
  });

  it("rejects a captured target with an empty handle (bad input)", () => {
    const empty: ForegroundInfo = { hwnd: "", className: "Notepad", processName: "notepad.exe" };
    const plan = planDelivery(baseInput({ captured: { info: empty, sampledAtMs: NOW } }));

    expect(plan.primary).toEqual({
      action: "clipboardToast",
      reason: EMPTY_CAPTURED_HWND_REASON,
    });
  });
});

describe("shouldShowTranscriptPreview — LD4 / #11 floor B", () => {
  it("shows the preview only after the text reached the external target", () => {
    expect(shouldShowTranscriptPreview({ delivered: true, hadLiveInsert: false })).toBe(true);
  });

  it("stays hidden when delivery failed — SpeakFlow UI is never the paste destination", () => {
    expect(shouldShowTranscriptPreview({ delivered: false, hadLiveInsert: false })).toBe(false);
  });

  it("stays hidden when live partials already showed the text in the field", () => {
    expect(shouldShowTranscriptPreview({ delivered: true, hadLiveInsert: true })).toBe(false);
  });
});
