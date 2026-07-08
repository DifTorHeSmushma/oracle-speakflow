import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../src/utils/config.js";
import { DEFAULT_HOTKEY, HOTKEY_CONFIG_VERSION } from "../src/utils/defaultHotkey.js";
import { isOk } from "../src/utils/result.js";

const ENV_KEYS = ["GROQ_API_KEY", "SPEAKFLOW_HOTKEY", "SPEAKFLOW_HOTKEY_VERSION"] as const;

describe("hotkey migration v2", () => {
  let dir: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    dir = mkdtempSync(join(tmpdir(), "speakflow-config-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it("migrates persisted Ctrl+Alt+* hotkey to F8 on first load after upgrade", () => {
    writeFileSync(
      join(dir, ".env"),
      [
        "GROQ_API_KEY=test-key",
        'SPEAKFLOW_HOTKEY={"ctrl":true,"shift":false,"alt":true,"keycode":30}',
      ].join("\n"),
      "utf-8"
    );

    const result = loadConfig(dir);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.hotkey).toEqual(DEFAULT_HOTKEY);

    const saved = readFileSync(join(dir, ".env"), "utf-8");
    expect(saved).toContain("SPEAKFLOW_HOTKEY_VERSION=2");
    expect(saved).toContain('"keycode":66');
  });

  it("does not re-migrate when version is already 2", () => {
    const custom = { ctrl: true, shift: false, alt: true, keycode: 34 };
    writeFileSync(
      join(dir, ".env"),
      [
        "GROQ_API_KEY=test-key",
        `SPEAKFLOW_HOTKEY=${JSON.stringify(custom)}`,
        `SPEAKFLOW_HOTKEY_VERSION=${HOTKEY_CONFIG_VERSION}`,
      ].join("\n"),
      "utf-8"
    );

    const result = loadConfig(dir);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.hotkey).toEqual(custom);
  });
});
