// Linux session detection — pure env-based, cached once (Spec §3.1 / §0 Q2 / G29).
// Two-lock keystroke gating: Lock A lives in getLinuxForegroundInfo (linux-window.ts);
// Lock B lives in the keystroke executor (electron-main.ts). Both assert session === "x11".

export type LinuxSession = "x11" | "wayland" | "unknown";

/**
 * Pure session detector — takes env for unit-testability (G29).
 * Precedence: XDG_SESSION_TYPE (authority) > WAYLAND_DISPLAY > DISPLAY > unknown.
 * WAYLAND_DISPLAY beats DISPLAY: every Wayland+XWayland session exports both;
 * resolving that tie to "x11" would unlock keystrokes where _NET_ACTIVE_WINDOW
 * cannot see wayland-native windows (S-L2/S-L9 safety rule).
 */
export const detectSessionFromEnv = (env: Record<string, string | undefined>): LinuxSession => {
  const t = env["XDG_SESSION_TYPE"]?.trim().toLowerCase();
  if (t === "wayland") return "wayland";
  if (t === "x11") return "x11";
  if (env["WAYLAND_DISPLAY"]) return "wayland";
  if (env["DISPLAY"]) return "x11";
  return "unknown";
};

let _cached: LinuxSession | undefined;

/** Cached at first call from process.env. Sessions do not change type mid-process. */
export const getLinuxSession = (): LinuxSession => {
  if (_cached === undefined) _cached = detectSessionFromEnv(process.env as Record<string, string | undefined>);
  return _cached;
};
