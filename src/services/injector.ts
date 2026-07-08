import { clipboard, keyboard, Key } from "@nut-tree-fork/nut-js";
import { Result, Ok, Err } from "../utils/result.js";

export type InjectorError =
  | { kind: "clipboardFailed"; message: string }
  | { kind: "keystrokeFailed"; message: string }
  | { kind: "readOnlyTarget"; message: string };

export const injectText = async (
  text: string
): Promise<Result<void, InjectorError>> => {
  try {
    await clipboard.setContent(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Err({ kind: "clipboardFailed", message });
  }

  // Brief pause so clipboard write is committed before the keystroke
  await new Promise((r) => setTimeout(r, 80));

  try {
    await keyboard.pressKey(Key.LeftControl, Key.V);
    await keyboard.releaseKey(Key.LeftControl, Key.V);
    return Ok(undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isReadOnly = message.toLowerCase().includes("readonly") ||
      message.toLowerCase().includes("read-only");
    return Err({
      kind: isReadOnly ? "readOnlyTarget" : "keystrokeFailed",
      message,
    });
  }
};
