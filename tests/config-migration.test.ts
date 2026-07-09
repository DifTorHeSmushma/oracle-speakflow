import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, migrateConfigV3, CONFIG_VERSION, CONFIG_V3, DEFAULT_CALL_APP_ALLOWLIST } from "../src/utils/config.js";
import { HOTKEY_CONFIG_VERSION } from "../src/utils/defaultHotkey.js";
import { isOk } from "../src/utils/result.js";

const VOICE_ENV_KEYS = [
  "SPEAKFLOW_CONFIG_VERSION",
  "SPEAKFLOW_VOICE_MODE",
  "SPEAKFLOW_VAD",
  "SPEAKFLOW_CORRECTION",
  "SPEAKFLOW_CALL_APP_ALLOWLIST",
  "SPEAKFLOW_TERMINAL_VARIANT",
  "SPEAKFLOW_MODEL_TIER",
] as const;

const ALL_ENV_KEYS = [
  "GROQ_API_KEY",
  "SPEAKFLOW_HOTKEY",
  "SPEAKFLOW_HOTKEY_VERSION",
  ...VOICE_ENV_KEYS,
] as const;

describe("config migration v3 — G12", () => {
  let dir: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ALL_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    dir = mkdtempSync(join(tmpdir(), "speakflow-cfg-v3-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    for (const key of ALL_ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  // ---------------------------------------------------------------------------
  // New install (no .env) — should write handsFree default
  // ---------------------------------------------------------------------------

  it("new install: migrateConfigV3 writes SPEAKFLOW_VOICE_MODE=handsFree", () => {
    writeFileSync(join(dir, ".env"), "GROQ_API_KEY=test-key\n", "utf-8");
    migrateConfigV3(dir);

    const content = readFileSync(join(dir, ".env"), "utf-8");
    expect(content).toContain("SPEAKFLOW_VOICE_MODE=handsFree");
  });

  it("new install: migrateConfigV3 stamps SPEAKFLOW_CONFIG_VERSION=3", () => {
    writeFileSync(join(dir, ".env"), "GROQ_API_KEY=test-key\n", "utf-8");
    migrateConfigV3(dir);

    const content = readFileSync(join(dir, ".env"), "utf-8");
    expect(content).toContain(`SPEAKFLOW_CONFIG_VERSION=${CONFIG_V3}`);
  });

  it("new install: loadConfig returns voiceMode='handsFree'", () => {
    writeFileSync(join(dir, ".env"), "GROQ_API_KEY=test-key\n", "utf-8");

    const result = loadConfig(dir);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.voiceMode).toBe("handsFree");
  });

  // ---------------------------------------------------------------------------
  // v2→v3 migration: preserves existing key/hotkey/transcriptionMode
  // ---------------------------------------------------------------------------

  it("v2→v3: preserves GROQ_API_KEY", () => {
    const hotkey = { ctrl: true, shift: false, alt: false, keycode: 66 };
    writeFileSync(
      join(dir, ".env"),
      [
        "GROQ_API_KEY=sk-preserved-key",
        `SPEAKFLOW_HOTKEY=${JSON.stringify(hotkey)}`,
        `SPEAKFLOW_HOTKEY_VERSION=${HOTKEY_CONFIG_VERSION}`,
      ].join("\n"),
      "utf-8"
    );

    const result = loadConfig(dir);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.groqApiKey).toBe("sk-preserved-key");
  });

  it("v2→v3: preserves SPEAKFLOW_HOTKEY", () => {
    const hotkey = { ctrl: true, shift: false, alt: true, keycode: 30 };
    writeFileSync(
      join(dir, ".env"),
      [
        "GROQ_API_KEY=test-key",
        `SPEAKFLOW_HOTKEY=${JSON.stringify(hotkey)}`,
        `SPEAKFLOW_HOTKEY_VERSION=${HOTKEY_CONFIG_VERSION}`,
      ].join("\n"),
      "utf-8"
    );

    const result = loadConfig(dir);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.hotkey).toEqual(hotkey);
  });

  it("v2→v3: writes handsFree default even if other keys exist", () => {
    writeFileSync(
      join(dir, ".env"),
      [
        "GROQ_API_KEY=test-key",
        `SPEAKFLOW_HOTKEY_VERSION=${HOTKEY_CONFIG_VERSION}`,
      ].join("\n"),
      "utf-8"
    );

    migrateConfigV3(dir);
    const content = readFileSync(join(dir, ".env"), "utf-8");
    expect(content).toContain("SPEAKFLOW_VOICE_MODE=handsFree");
  });

  // ---------------------------------------------------------------------------
  // Migration is idempotent — does not re-migrate when version matches
  // ---------------------------------------------------------------------------

  it("does not re-migrate when SPEAKFLOW_CONFIG_VERSION is already 3", () => {
    writeFileSync(
      join(dir, ".env"),
      [
        "GROQ_API_KEY=test-key",
        "SPEAKFLOW_VOICE_MODE=ptt", // user has set this to ptt
        `SPEAKFLOW_CONFIG_VERSION=${CONFIG_VERSION}`,
      ].join("\n"),
      "utf-8"
    );
    process.env["SPEAKFLOW_CONFIG_VERSION"] = CONFIG_VERSION;
    process.env["SPEAKFLOW_VOICE_MODE"] = "ptt";

    migrateConfigV3(dir);

    // Voice mode should still be ptt — migration must not overwrite
    const content = readFileSync(join(dir, ".env"), "utf-8");
    expect(content).toContain("SPEAKFLOW_VOICE_MODE=ptt");
    expect(content).not.toMatch(/SPEAKFLOW_VOICE_MODE=handsFree/);
  });

  // ---------------------------------------------------------------------------
  // New VAD/correction fields present after migration
  // ---------------------------------------------------------------------------

  it("new install: VAD defaults written", () => {
    writeFileSync(join(dir, ".env"), "GROQ_API_KEY=test-key\n", "utf-8");
    migrateConfigV3(dir);

    const content = readFileSync(join(dir, ".env"), "utf-8");
    expect(content).toContain("SPEAKFLOW_VAD=");
    expect(content).toContain('"positiveSpeechThreshold":0.42');
  });

  it("new install: call-app allowlist defaults written with 4 apps", () => {
    writeFileSync(join(dir, ".env"), "GROQ_API_KEY=test-key\n", "utf-8");
    migrateConfigV3(dir);

    const result = loadConfig(dir);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.callAppAllowlist).toEqual(DEFAULT_CALL_APP_ALLOWLIST);
    expect(result.value.callAppAllowlist).toHaveLength(4);
  });

  it("new install: terminalVariantEnabled defaults to false", () => {
    writeFileSync(join(dir, ".env"), "GROQ_API_KEY=test-key\n", "utf-8");

    const result = loadConfig(dir);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.terminalVariantEnabled).toBe(false);
  });

  it("envOverride: userData .env replaces pre-set process.env values", () => {
    process.env["SPEAKFLOW_CALL_APP_ALLOWLIST"] = '["Zoom.exe"]';
    writeFileSync(
      join(dir, ".env"),
      'GROQ_API_KEY=test-key\nSPEAKFLOW_CALL_APP_ALLOWLIST=[]\n',
      "utf-8"
    );

    const result = loadConfig(dir, { envOverride: true });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.callAppAllowlist).toEqual([]);
  });
});
