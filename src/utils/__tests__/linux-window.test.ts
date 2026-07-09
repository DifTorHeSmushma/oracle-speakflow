import { describe, expect, it } from "vitest";
import {
  parseActiveWindowId,
  parseWmClass,
  parseNetWmPid,
  toLinuxForegroundInfo,
  isLinuxSpeakFlowWindow,
  linuxForegroundMatches,
} from "../linux-window.js";

describe("linux-window pure parsers (G29 — any OS)", () => {
  // ── parseActiveWindowId ───────────────────────────────────────────────────

  describe("parseActiveWindowId", () => {
    it("parses standard xprop root output", () => {
      expect(parseActiveWindowId("_NET_ACTIVE_WINDOW: window id # 0x3c00007")).toBe("0x3c00007");
    });

    it("lowercases hex digits", () => {
      expect(parseActiveWindowId("_NET_ACTIVE_WINDOW: window id # 0x3C00007")).toBe("0x3c00007");
    });

    it("returns null for 0x0 (no active window)", () => {
      expect(parseActiveWindowId("_NET_ACTIVE_WINDOW: window id # 0x0")).toBeNull();
    });

    it("returns null when no hex id present", () => {
      expect(parseActiveWindowId("_NET_ACTIVE_WINDOW: not found")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(parseActiveWindowId("")).toBeNull();
    });
  });

  // ── parseWmClass ──────────────────────────────────────────────────────────

  describe("parseWmClass", () => {
    it("parses GNOME Terminal WM_CLASS", () => {
      const r = parseWmClass('WM_CLASS = "gnome-terminal-server", "Gnome-terminal"');
      expect(r).toEqual({ instance: "gnome-terminal-server", className: "gnome-terminal" });
    });

    it("lowercases both fields", () => {
      const r = parseWmClass('"Alacritty", "Alacritty"');
      expect(r).toEqual({ instance: "alacritty", className: "alacritty" });
    });

    it("returns null when no quoted pair found", () => {
      expect(parseWmClass("_NET_WM_PID = 4242")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(parseWmClass("")).toBeNull();
    });
  });

  // ── parseNetWmPid ─────────────────────────────────────────────────────────

  describe("parseNetWmPid", () => {
    it("parses numeric PID", () => {
      expect(parseNetWmPid("_NET_WM_PID = 4242")).toBe(4242);
    });

    it("parses PID embedded in multi-line output", () => {
      const out = 'WM_CLASS = "kitty", "kitty"\n_NET_WM_PID = 9999';
      expect(parseNetWmPid(out)).toBe(9999);
    });

    it("returns null when property absent", () => {
      expect(parseNetWmPid('WM_CLASS = "foo", "bar"')).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(parseNetWmPid("")).toBeNull();
    });
  });

  // ── toLinuxForegroundInfo ─────────────────────────────────────────────────

  describe("toLinuxForegroundInfo", () => {
    it("builds linux: pseudo-hwnd", () => {
      const info = toLinuxForegroundInfo("0x3c00007", { instance: "gnome-terminal-server", className: "gnome-terminal" }, "gnome-terminal-");
      expect(info.hwnd).toBe("linux:0x3c00007");
      expect(info.className).toBe("gnome-terminal");
      expect(info.processName).toBe("gnome-terminal-");
    });

    it("uses empty strings when wmClass is null", () => {
      const info = toLinuxForegroundInfo("0x1", null, "unknown");
      expect(info.className).toBe("");
      expect(info.hwnd).toBe("linux:0x1");
    });
  });

  // ── isLinuxSpeakFlowWindow ────────────────────────────────────────────────

  describe("isLinuxSpeakFlowWindow — own-window detection (S-L12)", () => {
    const OWN_PID = 1234;

    it("PID match → own window (strong evidence)", () => {
      expect(isLinuxSpeakFlowWindow(OWN_PID, null, OWN_PID)).toBe(true);
    });

    it("PID mismatch, class=electron → own window (WM_CLASS fallback)", () => {
      expect(isLinuxSpeakFlowWindow(9999, { instance: "electron", className: "electron" }, OWN_PID)).toBe(true);
    });

    it("PID mismatch, class=oracle-speakflow → own window", () => {
      expect(isLinuxSpeakFlowWindow(9999, { instance: "oracle-speakflow", className: "oracle-speakflow" }, OWN_PID)).toBe(true);
    });

    it("PID mismatch, class contains oracle speakflow → own window", () => {
      expect(isLinuxSpeakFlowWindow(9999, { instance: "oracle speakflow", className: "something else" }, OWN_PID)).toBe(true);
    });

    it("PID mismatch, class=gnome-terminal → external window (false-positive-safe)", () => {
      expect(isLinuxSpeakFlowWindow(9999, { instance: "gnome-terminal-server", className: "gnome-terminal" }, OWN_PID)).toBe(false);
    });

    it("PID null, class=cursor → external", () => {
      expect(isLinuxSpeakFlowWindow(null, { instance: "cursor", className: "cursor" }, OWN_PID)).toBe(false);
    });

    it("both null → false", () => {
      expect(isLinuxSpeakFlowWindow(null, null, OWN_PID)).toBe(false);
    });
  });

  // ── linuxForegroundMatches ────────────────────────────────────────────────

  describe("linuxForegroundMatches — strict re-verify", () => {
    it("hwnd equality → true", () => {
      const fg = toLinuxForegroundInfo("0x3c00007", null, "");
      expect(linuxForegroundMatches(fg, "linux:0x3c00007")).toBe(true);
    });

    it("hwnd mismatch → false", () => {
      const fg = toLinuxForegroundInfo("0x3c00007", null, "");
      expect(linuxForegroundMatches(fg, "linux:0x1234567")).toBe(false);
    });

    it("non-linux expectHwnd → false", () => {
      const fg = toLinuxForegroundInfo("0x3c00007", null, "");
      expect(linuxForegroundMatches(fg, "darwin:SomeApp")).toBe(false);
    });

    it("null foreground → false", () => {
      expect(linuxForegroundMatches(null, "linux:0x3c00007")).toBe(false);
    });
  });
});
