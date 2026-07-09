import { describe, expect, it } from "vitest";
import { resolveAvfAudioInput } from "../avfoundation-audio.js";

describe("resolveAvfAudioInput", () => {
  it("defaults to :0", () => {
    delete process.env.SPEAKFLOW_AVF_AUDIO;
    expect(resolveAvfAudioInput()).toBe(":0");
  });

  it("honors SPEAKFLOW_AVF_AUDIO index", () => {
    process.env.SPEAKFLOW_AVF_AUDIO = "2";
    expect(resolveAvfAudioInput()).toBe(":2");
    delete process.env.SPEAKFLOW_AVF_AUDIO;
  });

  it("strips leading colon from override", () => {
    process.env.SPEAKFLOW_AVF_AUDIO = ":1";
    expect(resolveAvfAudioInput()).toBe(":1");
    delete process.env.SPEAKFLOW_AVF_AUDIO;
  });
});
