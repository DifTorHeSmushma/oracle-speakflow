import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, migrateConfigV4, migrateConfigV5, CONFIG_VERSION, CONFIG_V4 } from "../config.js";
import { HYBRID_REDEMPTION_FRAMES } from "../../types/voice.js";
import { isOk } from "../result.js";

const ALL_ENV_KEYS = [
  "GROQ_API_KEY",
  "SPEAKFLOW_CONFIG_VERSION",
  "SPEAKFLOW_VOICE_MODE",
  "SPEAKFLOW_VAD",
  "SPEAKFLOW_CORRECTION",
  "SPEAKFLOW_CALL_APP_ALLOWLIST",
  "SPEAKFLOW_TERMINAL_VARIANT",
  "SPEAKFLOW_MODEL_TIER",
  "SPEAKFLOW_HOTKEY",
  "SPEAKFLOW_HOTKEY_VERSION",
] as const;

describe("config migration v4 — G26", () => {
  let dir: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ALL_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    dir = mkdtempSync(join(tmpdir(), "speakflow-cfg-v4-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    for (const key of ALL_ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  // ---------------------------------------------------------------------------
  // New install / v3→v4 migration
  // ---------------------------------------------------------------------------

  it("migrateConfigV4 writes SPEAKFLOW_MODEL_TIER=fast", () => {
    writeFileSync(join(dir, ".env"), "GROQ_API_KEY=test-key\n", "utf-8");
    migrateConfigV4(dir);

    const content = readFileSync(join(dir, ".env"), "utf-8");
    expect(content).toContain("SPEAKFLOW_MODEL_TIER=fast");
  });

  it("migrateConfigV4 stamps SPEAKFLOW_CONFIG_VERSION=4", () => {
    writeFileSync(join(dir, ".env"), "GROQ_API_KEY=test-key\n", "utf-8");
    migrateConfigV4(dir);

    const content = readFileSync(join(dir, ".env"), "utf-8");
    expect(content).toContain(`SPEAKFLOW_CONFIG_VERSION=${CONFIG_V4}`);
  });

  it("CONFIG_V4 is '4' and CONFIG_VERSION is '5'", () => {
    expect(CONFIG_V4).toBe("4");
    expect(CONFIG_VERSION).toBe("5");
  });

  // ---------------------------------------------------------------------------
  // Preserves existing keys
  // ---------------------------------------------------------------------------

  it("v3→v4: preserves GROQ_API_KEY", () => {
    writeFileSync(
      join(dir, ".env"),
      ["GROQ_API_KEY=sk-existing-key", "SPEAKFLOW_CONFIG_VERSION=3"].join("\n"),
      "utf-8"
    );
    process.env["SPEAKFLOW_CONFIG_VERSION"] = "3";

    const result = loadConfig(dir);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.groqApiKey).toBe("sk-existing-key");
  });

  it("v3→v4: preserves SPEAKFLOW_VOICE_MODE", () => {
    writeFileSync(
      join(dir, ".env"),
      [
        "GROQ_API_KEY=test-key",
        "SPEAKFLOW_VOICE_MODE=ptt",
        "SPEAKFLOW_CONFIG_VERSION=3",
      ].join("\n"),
      "utf-8"
    );
    process.env["SPEAKFLOW_CONFIG_VERSION"] = "3";
    process.env["SPEAKFLOW_VOICE_MODE"] = "ptt";

    const result = loadConfig(dir);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.voiceMode).toBe("ptt");
  });

  it("v3→v4: adds modelTier=fast when absent", () => {
    writeFileSync(
      join(dir, ".env"),
      ["GROQ_API_KEY=test-key", "SPEAKFLOW_CONFIG_VERSION=3"].join("\n"),
      "utf-8"
    );
    process.env["SPEAKFLOW_CONFIG_VERSION"] = "3";

    const result = loadConfig(dir);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.modelTier).toBe("fast");
  });

  // ---------------------------------------------------------------------------
  // Default modelTier
  // ---------------------------------------------------------------------------

  it("loadConfig returns modelTier=fast on new install", () => {
    writeFileSync(join(dir, ".env"), "GROQ_API_KEY=test-key\n", "utf-8");

    const result = loadConfig(dir);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.modelTier).toBe("fast");
  });

  // ---------------------------------------------------------------------------
  // Idempotent — does not re-migrate at v4
  // ---------------------------------------------------------------------------

  it("does not re-migrate when already at v4", () => {
    writeFileSync(
      join(dir, ".env"),
      [
        "GROQ_API_KEY=test-key",
        "SPEAKFLOW_MODEL_TIER=balanced", // user chose balanced
        `SPEAKFLOW_CONFIG_VERSION=${CONFIG_V4}`,
      ].join("\n"),
      "utf-8"
    );
    process.env["SPEAKFLOW_CONFIG_VERSION"] = CONFIG_V4;
    process.env["SPEAKFLOW_MODEL_TIER"] = "balanced";

    migrateConfigV4(dir);

    const content = readFileSync(join(dir, ".env"), "utf-8");
    expect(content).toContain("SPEAKFLOW_MODEL_TIER=balanced");
    expect(content).not.toMatch(/SPEAKFLOW_MODEL_TIER=fast/);
  });

  it("loadConfig respects user-set SPEAKFLOW_MODEL_TIER=balanced", () => {
    writeFileSync(
      join(dir, ".env"),
      [
        "GROQ_API_KEY=test-key",
        "SPEAKFLOW_MODEL_TIER=balanced",
        `SPEAKFLOW_CONFIG_VERSION=${CONFIG_VERSION}`,
      ].join("\n"),
      "utf-8"
    );

    const result = loadConfig(dir);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.modelTier).toBe("balanced");
  });

  it("loadConfig respects user-set SPEAKFLOW_MODEL_TIER=accurate", () => {
    writeFileSync(
      join(dir, ".env"),
      [
        "GROQ_API_KEY=test-key",
        "SPEAKFLOW_MODEL_TIER=accurate",
        `SPEAKFLOW_CONFIG_VERSION=${CONFIG_VERSION}`,
      ].join("\n"),
      "utf-8"
    );

    const result = loadConfig(dir);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.modelTier).toBe("accurate");
  });
});

describe("config migration v5 — issue #6 hybrid redemption floor", () => {
  let dir: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ALL_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    dir = mkdtempSync(join(tmpdir(), "speakflow-cfg-v5-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    for (const key of ALL_ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it("migrateConfigV5 bumps redemptionFrames 40 → 79", () => {
    const staleVad = {
      positiveSpeechThreshold: 0.42,
      negativeSpeechThreshold: 0.28,
      minSpeechFrames: 6,
      redemptionFrames: 40,
      preSpeechPadFrames: 20,
    };
    writeFileSync(
      join(dir, ".env"),
      [
        "GROQ_API_KEY=test-key",
        `SPEAKFLOW_VAD=${JSON.stringify(staleVad)}`,
        `SPEAKFLOW_CONFIG_VERSION=${CONFIG_V4}`,
      ].join("\n"),
      "utf-8"
    );
    process.env["SPEAKFLOW_CONFIG_VERSION"] = CONFIG_V4;
    process.env["SPEAKFLOW_VAD"] = JSON.stringify(staleVad);

    migrateConfigV5(dir);

    const content = readFileSync(join(dir, ".env"), "utf-8");
    expect(content).toContain(`SPEAKFLOW_CONFIG_VERSION=${CONFIG_VERSION}`);
    expect(content).toContain(`"redemptionFrames":${HYBRID_REDEMPTION_FRAMES}`);
  });

  it("loadConfig clamps stale redemptionFrames=40 even without migration stamp", () => {
    const staleVad = {
      positiveSpeechThreshold: 0.42,
      negativeSpeechThreshold: 0.28,
      minSpeechFrames: 6,
      redemptionFrames: 40,
      preSpeechPadFrames: 20,
    };
    writeFileSync(
      join(dir, ".env"),
      [
        "GROQ_API_KEY=test-key",
        `SPEAKFLOW_VAD=${JSON.stringify(staleVad)}`,
        `SPEAKFLOW_CONFIG_VERSION=${CONFIG_VERSION}`,
      ].join("\n"),
      "utf-8"
    );

    const result = loadConfig(dir);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.vad.redemptionFrames).toBe(HYBRID_REDEMPTION_FRAMES);
  });
});
