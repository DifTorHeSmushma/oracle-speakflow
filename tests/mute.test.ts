import { describe, it, expect, beforeEach } from "vitest";
import {
  getMuteState,
  setUserMute,
  setCallAppMute,
  setMicBusy,
  onMuteChange,
  isCallAppActive,
  DEFAULT_CALL_APP_ALLOWLIST,
  _resetForTest,
} from "../src/services/mute.js";

describe("mute service", () => {
  beforeEach(() => {
    _resetForTest();
  });

  it("default state is unmuted", () => {
    const s = getMuteState();
    expect(s.muted).toBe(false);
    expect(s.reason).toBeNull();
  });

  it("setUserMute(true) → muted with reason 'user'", () => {
    setUserMute(true);
    const s = getMuteState();
    expect(s.muted).toBe(true);
    expect(s.reason).toBe("user");
  });

  it("setUserMute(false) → unmuted", () => {
    setUserMute(true);
    setUserMute(false);
    const s = getMuteState();
    expect(s.muted).toBe(false);
    expect(s.reason).toBeNull();
  });

  it("onMuteChange fires when state changes", () => {
    const calls: ReturnType<typeof getMuteState>[] = [];
    onMuteChange((s) => calls.push(s));

    setUserMute(true);
    setUserMute(false);

    expect(calls).toHaveLength(2);
    expect(calls[0]?.muted).toBe(true);
    expect(calls[1]?.muted).toBe(false);
  });

  it("onMuteChange does NOT fire when state is unchanged", () => {
    const calls: number[] = [];
    onMuteChange(() => calls.push(1));

    setUserMute(false); // already false — no change
    expect(calls).toHaveLength(0);
  });

  it("getMuteState returns a copy, not the internal reference", () => {
    const s1 = getMuteState();
    setUserMute(true);
    const s2 = getMuteState();
    expect(s1.muted).toBe(false); // s1 is a snapshot
    expect(s2.muted).toBe(true);
  });

  it("setCallAppMute does not override user mute", () => {
    setUserMute(true);
    setCallAppMute(false); // attempt to un-mute — should be ignored
    const s = getMuteState();
    expect(s.muted).toBe(true);
    expect(s.reason).toBe("user");
  });

  it("setCallAppMute(true) → muted with reason 'callApp'", () => {
    setCallAppMute(true);
    const s = getMuteState();
    expect(s.muted).toBe(true);
    expect(s.reason).toBe("callApp");
  });

  it("setCallAppMute(false) clears callApp mute", () => {
    setCallAppMute(true);
    setCallAppMute(false);
    const s = getMuteState();
    expect(s.muted).toBe(false);
  });

  it("setMicBusy(true) → muted with reason 'micBusy'", () => {
    setMicBusy(true);
    expect(getMuteState().reason).toBe("micBusy");
  });

  // ---------------------------------------------------------------------------
  // isCallAppActive
  // ---------------------------------------------------------------------------

  it("isCallAppActive: returns false for empty process list", () => {
    expect(isCallAppActive([], DEFAULT_CALL_APP_ALLOWLIST)).toBe(false);
  });

  it("isCallAppActive: detects Zoom.exe (case-insensitive)", () => {
    expect(isCallAppActive(["zoom.exe", "chrome.exe"], DEFAULT_CALL_APP_ALLOWLIST)).toBe(true);
  });

  it("isCallAppActive: detects Teams.exe", () => {
    expect(isCallAppActive(["Teams.exe"], DEFAULT_CALL_APP_ALLOWLIST)).toBe(true);
  });

  it("isCallAppActive: detects ms-teams.exe", () => {
    expect(isCallAppActive(["ms-teams.exe"], DEFAULT_CALL_APP_ALLOWLIST)).toBe(true);
  });

  it("isCallAppActive: detects Discord.exe", () => {
    expect(isCallAppActive(["Discord.exe"], DEFAULT_CALL_APP_ALLOWLIST)).toBe(true);
  });

  it("isCallAppActive: msedgewebview2.exe is NOT in default allowlist", () => {
    expect(isCallAppActive(["msedgewebview2.exe"], DEFAULT_CALL_APP_ALLOWLIST)).toBe(false);
  });

  it("DEFAULT_CALL_APP_ALLOWLIST contains exactly 4 apps", () => {
    expect(DEFAULT_CALL_APP_ALLOWLIST).toHaveLength(4);
  });
});
