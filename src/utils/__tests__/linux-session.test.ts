import { describe, expect, it } from "vitest";
import { detectSessionFromEnv } from "../linux-session.js";

describe("linux-session — detectSessionFromEnv (G29)", () => {
  it("XDG_SESSION_TYPE=wayland → wayland", () => {
    expect(detectSessionFromEnv({ XDG_SESSION_TYPE: "wayland" })).toBe("wayland");
  });

  it("XDG_SESSION_TYPE=Wayland (mixed-case) → wayland", () => {
    expect(detectSessionFromEnv({ XDG_SESSION_TYPE: "Wayland" })).toBe("wayland");
  });

  it("XDG_SESSION_TYPE=x11 → x11", () => {
    expect(detectSessionFromEnv({ XDG_SESSION_TYPE: "x11" })).toBe("x11");
  });

  it("XDG_SESSION_TYPE=X11 (uppercase) → x11", () => {
    expect(detectSessionFromEnv({ XDG_SESSION_TYPE: "X11" })).toBe("x11");
  });

  it("XDG_SESSION_TYPE=  x11  (whitespace) → x11", () => {
    expect(detectSessionFromEnv({ XDG_SESSION_TYPE: "  x11  " })).toBe("x11");
  });

  it("XWayland tie: WAYLAND_DISPLAY + DISPLAY (no XDG_SESSION_TYPE) → wayland (S-L2/S-L9)", () => {
    expect(detectSessionFromEnv({ WAYLAND_DISPLAY: "wayland-0", DISPLAY: ":0" })).toBe("wayland");
  });

  it("WAYLAND_DISPLAY only (no XDG_SESSION_TYPE, no DISPLAY) → wayland", () => {
    expect(detectSessionFromEnv({ WAYLAND_DISPLAY: "wayland-0" })).toBe("wayland");
  });

  it("DISPLAY only (no XDG_SESSION_TYPE, no WAYLAND_DISPLAY) → x11", () => {
    expect(detectSessionFromEnv({ DISPLAY: ":0" })).toBe("x11");
  });

  it("empty env → unknown (headless/SSH/exotic)", () => {
    expect(detectSessionFromEnv({})).toBe("unknown");
  });

  it("all undefined values → unknown", () => {
    expect(detectSessionFromEnv({ XDG_SESSION_TYPE: undefined, WAYLAND_DISPLAY: undefined, DISPLAY: undefined })).toBe("unknown");
  });

  it("XDG_SESSION_TYPE wins over WAYLAND_DISPLAY when set to x11", () => {
    expect(detectSessionFromEnv({ XDG_SESSION_TYPE: "x11", WAYLAND_DISPLAY: "wayland-0" })).toBe("x11");
  });
});
