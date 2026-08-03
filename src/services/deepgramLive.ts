/**
 * Deepgram live streaming ASR — Aqua-class interim transcripts.
 * Only used when DEEPGRAM_API_KEY is set in userData .env.
 */
import WebSocket from "ws";
import { Ok, Err } from "../utils/result.js";
import type { Result } from "../utils/result.js";

export type DeepgramLiveError = { kind: "noKey" | "connectFailed" | "closed"; message: string };

export type DeepgramLiveSession = {
  sendPcm: (s16le: Buffer) => void;
  /** Wait briefly for finals, then close. Returns best assembled text. */
  finish: () => Promise<string>;
  abort: () => void;
  getText: () => string;
};

function resolveDeepgramKey(): string | null {
  const k = process.env["DEEPGRAM_API_KEY"]?.trim();
  return k && k.length > 8 ? k : null;
}

export function isDeepgramConfigured(): boolean {
  return resolveDeepgramKey() !== null;
}

/**
 * Open a Deepgram live socket (nova-2, linear16 @ 16 kHz, interim_results).
 * onUpdate receives full utterance text (committed finals + current interim).
 */
export async function createDeepgramLive(
  onUpdate: (text: string) => void
): Promise<Result<DeepgramLiveSession, DeepgramLiveError>> {
  const key = resolveDeepgramKey();
  if (!key) {
    return Err({ kind: "noKey", message: "DEEPGRAM_API_KEY not set" });
  }

  const params = new URLSearchParams({
    model: "nova-2",
    encoding: "linear16",
    sample_rate: "16000",
    channels: "1",
    interim_results: "true",
    punctuate: "true",
    smart_format: "true",
    endpointing: "300",
  });
  const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

  let committed = "";
  let interim = "";
  let closed = false;
  let socket: WebSocket;

  try {
    socket = new WebSocket(url, {
      headers: { Authorization: `Token ${key}` },
    });
  } catch (err) {
    return Err({
      kind: "connectFailed",
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const openPromise = new Promise<Result<void, DeepgramLiveError>>((resolve) => {
    const t = setTimeout(() => {
      resolve(Err({ kind: "connectFailed", message: "Deepgram open timeout" }));
    }, 8_000);
    socket.once("open", () => {
      clearTimeout(t);
      resolve(Ok(undefined));
    });
    socket.once("error", (err) => {
      clearTimeout(t);
      resolve(Err({ kind: "connectFailed", message: String(err) }));
    });
  });

  const opened = await openPromise;
  if (!opened.ok) {
    try {
      socket.close();
    } catch {
      /* ignore */
    }
    return Err(opened.error);
  }

  const emit = (): void => {
    const text = `${committed}${interim}`.replace(/\s+/g, " ").trim();
    if (text) onUpdate(text);
  };

  socket.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString()) as {
        type?: string;
        is_final?: boolean;
        channel?: { alternatives?: Array<{ transcript?: string }> };
      };
      if (msg.type && msg.type !== "Results") return;
      const piece = msg.channel?.alternatives?.[0]?.transcript?.trim() ?? "";
      if (!piece) return;
      if (msg.is_final) {
        committed = `${committed}${committed ? " " : ""}${piece}`.trim();
        interim = "";
      } else {
        interim = piece;
      }
      emit();
    } catch {
      /* ignore malformed */
    }
  });

  socket.on("close", () => {
    closed = true;
  });

  return Ok({
    sendPcm(s16le: Buffer) {
      if (closed || socket.readyState !== WebSocket.OPEN) return;
      socket.send(s16le);
    },
    getText() {
      return `${committed}${interim ? (committed ? " " : "") + interim : ""}`.trim();
    },
    abort() {
      closed = true;
      try {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "CloseStream" }));
        }
        socket.close();
      } catch {
        /* ignore */
      }
    },
    async finish() {
      try {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "CloseStream" }));
        }
      } catch {
        /* ignore */
      }
      await new Promise<void>((r) => setTimeout(r, 400));
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      closed = true;
      return `${committed}${interim ? (committed ? " " : "") + interim : ""}`.trim();
    },
  });
}
