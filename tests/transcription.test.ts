import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  transcribe,
  transcribeFinalize,
  CLOUD_FINALIZE_TIMEOUT_MS,
  FINALIZE_MODEL,
} from "../src/services/transcription.js";

// vi.hoisted() runs before vi.mock() hoisting — gives us shared references
// that are accessible in both the factory and the test body.
const { mockCreate, MockAPIError, mockSpawnSync, mockExistsSync, mockWriteFileSync, mockReadFileSync, mockUnlinkSync, mockGetBinaryPath, mockResolveTierModel } = vi.hoisted(() => {
  const mockCreate = vi.fn();
  const mockSpawnSync = vi.fn();
  const mockExistsSync = vi.fn();
  const mockWriteFileSync = vi.fn();
  const mockReadFileSync = vi.fn();
  const mockUnlinkSync = vi.fn();
  const mockGetBinaryPath = vi.fn();
  const mockResolveTierModel = vi.fn();

  class MockAPIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = "APIError";
      this.status = status;
    }
  }

  return { mockCreate, MockAPIError, mockSpawnSync, mockExistsSync, mockWriteFileSync, mockReadFileSync, mockUnlinkSync, mockGetBinaryPath, mockResolveTierModel };
});

// Attach APIError to the constructor so `Groq.APIError` (accessed as a static
// property on the default import) resolves to our mock class.
vi.mock("groq-sdk", () => {
  const ctor = vi.fn().mockImplementation(() => ({
    audio: { transcriptions: { create: mockCreate } },
  }));
  Object.assign(ctor, { APIError: MockAPIError });
  return { default: ctor };
});

vi.mock("node:child_process", () => ({
  spawnSync: mockSpawnSync,
}));

vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
  writeFileSync: mockWriteFileSync,
  readFileSync: mockReadFileSync,
  unlinkSync: mockUnlinkSync,
}));

vi.mock("../src/utils/binaryPath.js", () => ({
  getBinaryPath: mockGetBinaryPath,
}));

// modelRegistry is mocked so transcribeLocal can be unit-tested without
// hitting the real SHA-manifest logic (G16 is covered by modelRegistry.test.ts).
vi.mock("../src/services/modelRegistry.js", () => ({
  resolveTierModel: mockResolveTierModel,
  TIER_LADDER: {
    fast: {
      tier: "fast",
      filename: "ggml-tiny.en.bin",
      sizeBytes: 77_704_715,
      source: "bundled",
      minRamMB: 512,
      batchAcceptable: true,
    },
    balanced: {
      tier: "balanced",
      filename: "ggml-small.en-q5_1.bin",
      sizeBytes: 190_098_681,
      source: "download",
      minRamMB: 1024,
      batchAcceptable: false,
    },
    accurate: {
      tier: "accurate",
      filename: "ggml-large-v3-turbo-q5_0.bin",
      sizeBytes: 574_041_195,
      source: "download",
      minRamMB: 2048,
      batchAcceptable: false,
    },
  },
}));

describe("transcription service", () => {
  const dummyBuffer = Buffer.from("fake-wav-data");
  const apiKey = "sk-test-key";

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockReset();
  });

  // ---- Happy path ----------------------------------------------------------

  it("returns Ok with trimmed transcribed text on success", async () => {
    mockCreate.mockResolvedValueOnce("  Hello world  ");
    const result = await transcribe(apiKey, dummyBuffer, "whisper-large-v3-turbo", "en");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("Hello world");
  });

  // ---- Empty / whitespace -------------------------------------------------

  it("returns Err(emptyTranscription) when Groq returns empty string", async () => {
    mockCreate.mockResolvedValueOnce("");
    const result = await transcribe(apiKey, dummyBuffer, "whisper-large-v3-turbo", "en");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("emptyTranscription");
  });

  it("returns Err(emptyTranscription) when Groq returns whitespace-only string", async () => {
    mockCreate.mockResolvedValueOnce("   \n\t  ");
    const result = await transcribe(apiKey, dummyBuffer, "whisper-large-v3-turbo", "en");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("emptyTranscription");
  });

  // ---- API key error -------------------------------------------------------

  it("returns Err(invalidApiKey) on 401 from Groq and does NOT retry", async () => {
    mockCreate.mockRejectedValueOnce(new MockAPIError(401, "Unauthorized"));
    const result = await transcribe(apiKey, dummyBuffer, "whisper-large-v3-turbo", "en");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalidApiKey");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  // ---- Non-401 API error ---------------------------------------------------

  it("returns Err(apiError) with status code on non-401 Groq API error", async () => {
    mockCreate.mockRejectedValueOnce(new MockAPIError(503, "Service Unavailable"));
    const result = await transcribe(apiKey, dummyBuffer, "whisper-large-v3-turbo", "en");
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "apiError") {
      expect(result.error.statusCode).toBe(503);
    }
  });

  // ---- Network / transient errors -----------------------------------------

  it("returns Err(networkTimeout) on ETIMEDOUT after one retry", async () => {
    const networkErr = Object.assign(new Error("connect failed"), { code: "ETIMEDOUT" });
    mockCreate.mockRejectedValue(networkErr);

    const result = await transcribe(apiKey, dummyBuffer, "whisper-large-v3-turbo", "en");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("networkTimeout");
    // CLOUD_RETRY_ATTEMPTS = 1 → initial + one retry
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("constructs Groq client with 25s cloud timeout", async () => {
    const Groq = (await import("groq-sdk")).default as unknown as ReturnType<typeof vi.fn>;
    mockCreate.mockResolvedValueOnce("ok");
    await transcribe(apiKey, dummyBuffer, "whisper-large-v3-turbo", "en");
    expect(Groq).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey, timeout: 25_000 })
    );
  });

  it("finalize path uses turbo settle model, short timeout, and vocabulary prompt (#12/#13)", async () => {
    const Groq = (await import("groq-sdk")).default as unknown as ReturnType<typeof vi.fn>;
    mockCreate.mockResolvedValueOnce("SpeakFlow test");
    await transcribeFinalize(apiKey, dummyBuffer, "en");
    expect(Groq).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey, timeout: CLOUD_FINALIZE_TIMEOUT_MS })
    );
    expect(FINALIZE_MODEL).toBe("whisper-large-v3-turbo");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: FINALIZE_MODEL,
        temperature: 0,
        prompt: expect.stringContaining("SpeakFlow"),
      })
    );
  });

  it("finalize does not retry on timeout (#12 latency floor)", async () => {
    const networkErr = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
    mockCreate.mockRejectedValue(networkErr);
    const result = await transcribeFinalize(apiKey, dummyBuffer, "en");
    expect(result.ok).toBe(false);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  // ---- Gate G-D4: aborted requests are typed as timeouts, not opaque API errors ----

  it("maps an aborted Groq request (APIError status 0) to networkTimeout", async () => {
    // The SDK surfaces its own timeout as APIError{status: 0, "Request timed out."}.
    // Reporting that as apiError(0) hid every real timeout behind an unactionable message.
    mockCreate.mockRejectedValue(new MockAPIError(0, "Request timed out."));

    const result = await transcribe(apiKey, dummyBuffer, "whisper-large-v3-turbo", "en");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("networkTimeout");
  });

  it("maps a bare timeout Error with no error code to networkTimeout", async () => {
    mockCreate.mockRejectedValue(new Error("Request timed out."));

    const result = await transcribe(apiKey, dummyBuffer, "whisper-large-v3-turbo", "en");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("networkTimeout");
  });

  it("keeps a genuine server error as apiError rather than a timeout", async () => {
    mockCreate.mockRejectedValue(new MockAPIError(500, "Internal Server Error"));

    const result = await transcribe(apiKey, dummyBuffer, "whisper-large-v3-turbo", "en");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("apiError");
  });

  it("returns Err(networkTimeout) on ECONNRESET", async () => {
    const networkErr = Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
    mockCreate.mockRejectedValue(networkErr);

    const result = await transcribe(apiKey, dummyBuffer, "whisper-large-v3-turbo", "en");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("networkTimeout");
  });

  it("retries once on transient network error then succeeds", async () => {
    const networkErr = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
    mockCreate.mockRejectedValueOnce(networkErr).mockResolvedValueOnce("Hello after retry");

    const result = await transcribe(apiKey, dummyBuffer, "whisper-large-v3-turbo", "en");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("Hello after retry");
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Local transcription mode
// ---------------------------------------------------------------------------
describe("transcription service (local mode)", () => {
  const dummyBuffer = Buffer.from("fake-wav-data");
  const whisperPath = "C:\\resources\\bin\\whisper-cli.exe";
  const resolvedModelPath = "C:\\resources\\bin\\ggml-tiny.en.bin";

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockReset();
    mockGetBinaryPath.mockReturnValue(whisperPath);
    // Default: model resolves OK — tests that need a failure override this.
    mockResolveTierModel.mockReturnValue({ ok: true, value: resolvedModelPath });
  });

  it("returns Err(localModelNotFound) when resolveTierModel reports model not found", async () => {
    mockResolveTierModel.mockReturnValue({
      ok: false,
      error: { kind: "modelNotFound", message: "ggml-tiny.en.bin not found in any search dir" },
    });

    const result = await transcribe("", dummyBuffer, "base", "en", "local");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("localModelNotFound");
    }
  });

  it("returns Err(localTranscriptionFailed) on SHA integrity mismatch from resolveTierModel", async () => {
    mockResolveTierModel.mockReturnValue({
      ok: false,
      error: { kind: "modelIntegrity", message: "SHA-256 mismatch for ggml-tiny.en.bin" },
    });

    const result = await transcribe("", dummyBuffer, "base", "en", "local");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("localTranscriptionFailed");
    }
  });

  it("returns Err(localModelNotFound) when whisper-cli.exe does not exist", async () => {
    mockExistsSync.mockReturnValue(false);

    const result = await transcribe("", dummyBuffer, "base", "en", "local");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("localModelNotFound");
    }
  });

  it("returns Ok with transcribed text on success", async () => {
    // whisper-cli.exe exists
    mockExistsSync.mockImplementation((p: string) => {
      if (p === whisperPath) return true;
      // The .txt output file also exists
      return p.endsWith(".txt");
    });
    mockSpawnSync.mockReturnValue({ status: 0, error: null, stderr: Buffer.from("") });
    mockReadFileSync.mockReturnValue("  Hello from local whisper  ");

    const result = await transcribe("", dummyBuffer, "base", "en", "local");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("Hello from local whisper");
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
  });

  it("passes the resolved model path (not cloud model id) to whisper-cli", async () => {
    mockExistsSync.mockImplementation((p: string) => p === whisperPath || p.endsWith(".txt"));
    mockSpawnSync.mockReturnValue({ status: 0, error: null, stderr: Buffer.from("") });
    mockReadFileSync.mockReturnValue("hello");

    await transcribe("", dummyBuffer, "whisper-large-v3-turbo", "en", "local");

    expect(mockSpawnSync).toHaveBeenCalledWith(
      whisperPath,
      expect.arrayContaining(["--model", resolvedModelPath]),
      expect.any(Object),
    );
  });

  it("uses --output-file (not deprecated --output-dir) for whisper-cli v1.9+", async () => {
    mockExistsSync.mockImplementation((p: string) => p === whisperPath || p.endsWith(".txt"));
    mockSpawnSync.mockReturnValue({ status: 0, error: null, stderr: Buffer.from("") });
    mockReadFileSync.mockReturnValue("hello");

    await transcribe("", dummyBuffer, "base", "en", "local");

    const args = mockSpawnSync.mock.calls[0]?.[1] as string[];
    expect(args).toContain("--output-file");
    expect(args).not.toContain("--output-dir");
  });

  it("returns Err(emptyTranscription) when whisper-cli output is empty", async () => {
    mockExistsSync.mockReturnValue(true);
    mockSpawnSync.mockReturnValue({ status: 0, error: null, stderr: Buffer.from("") });
    mockReadFileSync.mockReturnValue("   ");

    const result = await transcribe("", dummyBuffer, "base", "en", "local");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("emptyTranscription");
  });

  it("returns Err(localTranscriptionFailed) when whisper-cli exits non-zero", async () => {
    mockExistsSync.mockImplementation((p: string) => p === whisperPath);
    mockSpawnSync.mockReturnValue({
      status: 1,
      error: null,
      stderr: Buffer.from("model file not found\nextra noise"),
    });

    const result = await transcribe("", dummyBuffer, "base", "en", "local");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("localTranscriptionFailed");
      if (result.error.kind === "localTranscriptionFailed") {
        expect(result.error.message).toContain("model file not found");
      }
    }
    // Verify temp wav file is cleaned up on error path (regression for temp-file leak)
    expect(mockUnlinkSync).toHaveBeenCalledWith(expect.stringContaining("speakflow-"));
    expect(mockUnlinkSync).toHaveBeenCalledTimes(1);  // only wavPath, no txtPath yet
  });

  it("returns Err(localTranscriptionFailed) when spawn itself errors", async () => {
    mockExistsSync.mockImplementation((p: string) => p === whisperPath);
    mockSpawnSync.mockReturnValue({
      status: null,
      error: new Error("EACCES"),
      stderr: Buffer.from(""),
    });

    const result = await transcribe("", dummyBuffer, "base", "en", "local");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("localTranscriptionFailed");
    // Verify temp wav file is cleaned up on error path (regression for temp-file leak)
    expect(mockUnlinkSync).toHaveBeenCalledWith(expect.stringContaining("speakflow-"));
    expect(mockUnlinkSync).toHaveBeenCalledTimes(1);  // only wavPath, no txtPath yet
  });

  it("returns Err(localTranscriptionFailed) when whisper-cli produces no .txt output file", async () => {
    // whisper-cli.exe exists but the output .txt file is not produced
    mockExistsSync.mockImplementation((p: string) => p === whisperPath);
    mockSpawnSync.mockReturnValue({ status: 0, error: null, stderr: Buffer.from("") });

    const result = await transcribe("", dummyBuffer, "base", "en", "local");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("localTranscriptionFailed");
      if (result.error.kind === "localTranscriptionFailed") {
        expect(result.error.message).toContain(".txt output file");
      }
    }
    // Verify temp wav file is cleaned up (no txt file to clean up in this branch)
    expect(mockUnlinkSync).toHaveBeenCalledWith(expect.stringContaining("speakflow-"));
    expect(mockUnlinkSync).toHaveBeenCalledTimes(1);
  });

  it("defaults to remote mode when mode parameter is omitted", async () => {
    mockCreate.mockResolvedValueOnce("remote result");

    const result = await transcribe("sk-test", dummyBuffer, "whisper-large-v3-turbo", "en");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("remote result");
    // Should not touch local whisper
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });
});
