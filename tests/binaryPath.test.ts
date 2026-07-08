import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "node:path";

// Shared mock — vi.hoisted ensures availability inside vi.mock factory.
const { mockApp, mockCreateRequire } = vi.hoisted(() => ({
  mockApp: { isPackaged: false },
  mockCreateRequire: vi.fn(),
}));

// Mock node:module's createRequire so getBinaryPath can conditionally load electron
vi.mock("node:module", () => ({
  createRequire: () => mockCreateRequire,
}));

describe("getBinaryPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockApp.isPackaged = false;
  });

  it("returns dev path when electron is not available (CLI mode)", async () => {
    mockCreateRequire.mockImplementation(() => {
      throw new Error("Cannot find module 'electron'");
    });

    const { getBinaryPath } = await import("../src/utils/binaryPath.js");
    const result = getBinaryPath("ffmpeg.exe");

    // Dev path: <dist/utils/> → ../../resources/bin/ffmpeg.exe
    expect(result).toContain("resources");
    expect(result).toContain("bin");
    expect(result.endsWith("ffmpeg.exe")).toBe(true);
  });

  it("returns dev path when electron app is not packaged", async () => {
    mockApp.isPackaged = false;
    mockCreateRequire.mockReturnValue({ app: mockApp });

    const { getBinaryPath } = await import("../src/utils/binaryPath.js");
    const result = getBinaryPath("whisper-cli.exe");

    expect(result).toContain("resources");
    expect(result).toContain("bin");
    expect(result.endsWith("whisper-cli.exe")).toBe(true);
  });

  it("returns resourcesPath-based path when electron app is packaged", async () => {
    mockApp.isPackaged = true;
    mockCreateRequire.mockReturnValue({ app: mockApp });

    // Simulate Electron's process.resourcesPath
    const original = (process as unknown as { resourcesPath?: string }).resourcesPath;
    (process as unknown as { resourcesPath: string }).resourcesPath = "/fake/resources";

    try {
      const { getBinaryPath } = await import("../src/utils/binaryPath.js");
      const result = getBinaryPath("ffmpeg.exe");

      expect(result).toBe(join("/fake/resources", "bin", "ffmpeg.exe"));
    } finally {
      if (original === undefined) {
        delete (process as unknown as { resourcesPath?: string }).resourcesPath;
      } else {
        (process as unknown as { resourcesPath: string }).resourcesPath = original;
      }
    }
  });
});
