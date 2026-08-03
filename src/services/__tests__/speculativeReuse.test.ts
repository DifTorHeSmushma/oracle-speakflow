import { describe, expect, it } from "vitest";
import {
  shouldReuseSpeculative,
  shouldKickEarlySpeculative,
  SPEC_REUSE_FRAME_SLACK,
  EARLY_SPEC_MIN_FRAMES,
  EARLY_SPEC_INTERVAL_FRAMES,
} from "../speculativeReuse.js";

describe("shouldReuseSpeculative", () => {
  it("reuses when final grew only by hangover slack", () => {
    expect(
      shouldReuseSpeculative({
        hasPromise: true,
        speculativeSessionFrames: 200,
        finalSpeechFrames: 200 + SPEC_REUSE_FRAME_SLACK,
      })
    ).toBe(true);
  });

  it("does not reuse when user kept talking past slack", () => {
    expect(
      shouldReuseSpeculative({
        hasPromise: true,
        speculativeSessionFrames: 200,
        finalSpeechFrames: 200 + SPEC_REUSE_FRAME_SLACK + 1,
      })
    ).toBe(false);
  });

  it("does not reuse without a promise", () => {
    expect(
      shouldReuseSpeculative({
        hasPromise: false,
        speculativeSessionFrames: 200,
        finalSpeechFrames: 200,
      })
    ).toBe(false);
  });
});

describe("shouldKickEarlySpeculative", () => {
  it("kicks at min frames when never kicked", () => {
    expect(
      shouldKickEarlySpeculative({
        sessionFrames: EARLY_SPEC_MIN_FRAMES,
        lastKickFrames: 0,
      })
    ).toBe(true);
  });

  it("waits for interval before refresh", () => {
    expect(
      shouldKickEarlySpeculative({
        sessionFrames: EARLY_SPEC_MIN_FRAMES + EARLY_SPEC_INTERVAL_FRAMES - 1,
        lastKickFrames: EARLY_SPEC_MIN_FRAMES,
      })
    ).toBe(false);
    expect(
      shouldKickEarlySpeculative({
        sessionFrames: EARLY_SPEC_MIN_FRAMES + EARLY_SPEC_INTERVAL_FRAMES,
        lastKickFrames: EARLY_SPEC_MIN_FRAMES,
      })
    ).toBe(true);
  });

  it("uses ~3s refresh cadence so in-flight Groq is not killed every 1.5s", () => {
    expect(EARLY_SPEC_INTERVAL_FRAMES).toBe(94);
  });
});
