import { describe, it, expect, beforeEach } from "vitest";
import {
  parseFirstDshowAudioInput,
  _resetDshowCacheForTest,
} from "../src/utils/dshow-audio.js";

const SAMPLE_LIST = `
[dshow @ 0000] "Microphone Array (Realtek(R) Audio)" (audio)
[dshow @ 0000]   Alternative name "@device_cm_{33D9A762-90C8-11D0-BD43-00A0C911CE86}\\wave_{1BCAC32E-9832-42CC-9081-73FB7763E706}"
[dshow @ 0000] "USB2.0 HD UVC WebCam" (video)
`;

describe("parseFirstDshowAudioInput", () => {
  beforeEach(() => _resetDshowCacheForTest());

  it("returns alternative name for first audio device", () => {
    expect(parseFirstDshowAudioInput(SAMPLE_LIST)).toBe(
      "audio=@device_cm_{33D9A762-90C8-11D0-BD43-00A0C911CE86}\\wave_{1BCAC32E-9832-42CC-9081-73FB7763E706}"
    );
  });

  it("falls back to friendly name when no alternative line", () => {
    const stderr = `[dshow] "Headset Mic" (audio)\n`;
    expect(parseFirstDshowAudioInput(stderr)).toBe("audio=Headset Mic");
  });

  it("returns null when no audio devices", () => {
    expect(parseFirstDshowAudioInput(`[dshow] "WebCam" (video)\n`)).toBeNull();
  });
});
