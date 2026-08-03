import { Ok, Err } from "../utils/result.js";
import type { Result } from "../utils/result.js";

export type LiveInsertPlan =
  | { mode: "noop" }
  | { mode: "appendDelta"; selectBackChars: 0; clipboardText: string }
  | { mode: "replaceSpan"; selectBackChars: number; clipboardText: string };

export type LiveInsertError = {
  kind: "empty-next-with-live";
  message: string;
};

/**
 * Pure replace-span planner for Phase-1 live insert (issue #6).
 * Does not touch clipboard or keyboard — caller executes via paste ladder.
 */
export const planLiveInsert = (
  previousLiveText: string,
  nextText: string
): Result<LiveInsertPlan, LiveInsertError> => {
  if (nextText === "" && previousLiveText !== "") {
    // greppable: liveInsert:empty-next-with-live
    return Err({
      kind: "empty-next-with-live",
      message: "liveInsert:empty-next-with-live",
    });
  }

  if (nextText === previousLiveText) {
    return Ok({ mode: "noop" });
  }

  if (previousLiveText.length === 0) {
    return Ok({ mode: "appendDelta", selectBackChars: 0, clipboardText: nextText });
  }

  if (nextText.startsWith(previousLiveText)) {
    const suffix = nextText.slice(previousLiveText.length);
    if (suffix.length === 0) return Ok({ mode: "noop" });
    return Ok({ mode: "appendDelta", selectBackChars: 0, clipboardText: suffix });
  }

  return Ok({
    mode: "replaceSpan",
    selectBackChars: previousLiveText.length,
    clipboardText: nextText,
  });
};
