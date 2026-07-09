import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock binaryPath at the service boundary
const { mockGetVerifiedModelPath, mockGetBundledBinDir } = vi.hoisted(() => ({
  mockGetVerifiedModelPath: vi.fn(),
  mockGetBundledBinDir: vi.fn().mockReturnValue("/fake/bundled/bin"),
}));

vi.mock("../../utils/binaryPath.js", () => ({
  getBinaryPath: vi.fn().mockReturnValue("/fake/bundled/bin/placeholder"),
  getBundledBinDir: mockGetBundledBinDir,
  getVerifiedModelPath: mockGetVerifiedModelPath,
}));

import { TIER_LADDER, resolveTierModel, isTierAvailable } from "../modelRegistry.js";
import { Ok, Err } from "../../utils/result.js";

describe("modelRegistry — G16", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBundledBinDir.mockReturnValue("/fake/bundled/bin");
  });

  // ---------------------------------------------------------------------------
  // TIER_LADDER shape
  // ---------------------------------------------------------------------------

  it("TIER_LADDER has all three tiers", () => {
    expect(TIER_LADDER.fast).toBeDefined();
    expect(TIER_LADDER.balanced).toBeDefined();
    expect(TIER_LADDER.accurate).toBeDefined();
  });

  it("fast tier is bundled and batchAcceptable", () => {
    const fast = TIER_LADDER.fast;
    expect(fast.source).toBe("bundled");
    expect(fast.batchAcceptable).toBe(true);
    expect(fast.filename).toBe("ggml-tiny.en.bin");
    expect(fast.sizeBytes).toBe(77_704_715);
  });

  it("balanced tier is download-only, batchAcceptable=false", () => {
    const bal = TIER_LADDER.balanced;
    expect(bal.source).toBe("download");
    expect(bal.batchAcceptable).toBe(false);
    expect(bal.filename).toBe("ggml-small.en-q5_1.bin");
    expect(bal.sizeBytes).toBe(190_098_681);
    expect(bal.url).toMatch(/ggml-small.en-q5_1/);
  });

  it("accurate tier is download-only, batchAcceptable=false", () => {
    const acc = TIER_LADDER.accurate;
    expect(acc.source).toBe("download");
    expect(acc.batchAcceptable).toBe(false);
    expect(acc.filename).toBe("ggml-large-v3-turbo-q5_0.bin");
    expect(acc.sizeBytes).toBe(574_041_195);
    expect(acc.url).toMatch(/ggml-large-v3-turbo/);
  });

  // ---------------------------------------------------------------------------
  // resolveTierModel
  // ---------------------------------------------------------------------------

  it("resolveTierModel returns Ok with path when model verifies", () => {
    mockGetVerifiedModelPath.mockReturnValue(Ok("/fake/bundled/bin/ggml-tiny.en.bin"));

    const result = resolveTierModel("fast");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe("/fake/bundled/bin/ggml-tiny.en.bin");
  });

  it("resolveTierModel passes filename to getVerifiedModelPath", () => {
    mockGetVerifiedModelPath.mockReturnValue(Ok("/some/path/ggml-tiny.en.bin"));
    resolveTierModel("fast");

    expect(mockGetVerifiedModelPath).toHaveBeenCalledWith(
      "ggml-tiny.en.bin",
      expect.any(Array),
    );
  });

  it("resolveTierModel returns Err(modelNotFound) when file is absent", () => {
    mockGetVerifiedModelPath.mockReturnValue(
      Err({ kind: "modelNotFound", message: "not found" })
    );

    const result = resolveTierModel("fast");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("modelNotFound");
  });

  it("resolveTierModel returns Err(modelIntegrity) on SHA mismatch — hard-block", () => {
    mockGetVerifiedModelPath.mockReturnValue(
      Err({ kind: "modelIntegrity", message: "hash mismatch" })
    );

    const result = resolveTierModel("fast");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("modelIntegrity");
  });

  it("resolveTierModel uses custom searchDirs when provided", () => {
    mockGetVerifiedModelPath.mockReturnValue(Ok("/user/models/ggml-tiny.en.bin"));

    resolveTierModel("fast", ["/user/models"]);

    expect(mockGetVerifiedModelPath).toHaveBeenCalledWith("ggml-tiny.en.bin", ["/user/models"]);
  });

  it("resolveTierModel defaults to bundled bin dir when searchDirs omitted", () => {
    mockGetVerifiedModelPath.mockReturnValue(Ok("/fake/bundled/bin/ggml-tiny.en.bin"));

    resolveTierModel("fast");

    expect(mockGetVerifiedModelPath).toHaveBeenCalledWith(
      "ggml-tiny.en.bin",
      ["/fake/bundled/bin"],
    );
  });

  // ---------------------------------------------------------------------------
  // isTierAvailable
  // ---------------------------------------------------------------------------

  it("isTierAvailable returns true when model resolves successfully", () => {
    mockGetVerifiedModelPath.mockReturnValue(Ok("/fake/path/ggml-tiny.en.bin"));
    expect(isTierAvailable("fast")).toBe(true);
  });

  it("isTierAvailable returns false when model is not found", () => {
    mockGetVerifiedModelPath.mockReturnValue(
      Err({ kind: "modelNotFound", message: "absent" })
    );
    expect(isTierAvailable("balanced")).toBe(false);
  });

  it("isTierAvailable returns false on integrity failure", () => {
    mockGetVerifiedModelPath.mockReturnValue(
      Err({ kind: "modelIntegrity", message: "bad hash" })
    );
    expect(isTierAvailable("accurate")).toBe(false);
  });
});
