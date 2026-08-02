import { describe, it, expect } from "vitest";
import { resolveDefaultLanguage } from "../config.js";

describe("resolveDefaultLanguage", () => {
  it("defaults to English when no Thai locale signals", () => {
    expect(resolveDefaultLanguage({}, "en-US")).toBe("en");
    expect(resolveDefaultLanguage({}, "en")).toBe("en");
  });

  it("defaults to Thai when OS / UI locale is Thai", () => {
    expect(resolveDefaultLanguage({}, "th-TH")).toBe("th");
    expect(resolveDefaultLanguage({ SPEAKFLOW_OS_LOCALE: "th" }, "en-US")).toBe("th");
    expect(resolveDefaultLanguage({ LANG: "th_TH.UTF-8" }, "en-US")).toBe("th");
  });

  it("does not treat non-Thai locales as Thai", () => {
    expect(resolveDefaultLanguage({}, "de-DE")).toBe("en");
    expect(resolveDefaultLanguage({ LANG: "ja_JP.UTF-8" }, "ja-JP")).toBe("en");
  });
});
