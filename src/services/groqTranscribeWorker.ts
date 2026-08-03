/**
 * Runs Groq Whisper off the Electron main thread so Silero/ffmpeg cannot starve fetch.
 * Parent posts: { apiKey, wavBase64, model, language, prompt?, timeoutMs }
 * Worker replies: { ok: true, text, ms } | { ok: false, error, ms }
 */
import { parentPort } from "node:worker_threads";
import Groq from "groq-sdk";

type Job = {
  apiKey: string;
  wavBase64: string;
  model: string;
  language: string;
  prompt?: string;
  timeoutMs: number;
};

async function run(job: Job): Promise<{ ok: true; text: string; ms: number } | { ok: false; error: string; ms: number }> {
  const t0 = performance.now();
  try {
    const audioBuffer = Buffer.from(job.wavBase64, "base64");
    const client = new Groq({ apiKey: job.apiKey, timeout: job.timeoutMs });
    const file = new File([new Uint8Array(audioBuffer)], "recording.wav", { type: "audio/wav" });
    const body: {
      file: File;
      model: string;
      language: string;
      response_format: "text";
      prompt?: string;
      temperature: number;
    } = {
      file,
      model: job.model,
      language: job.language,
      response_format: "text",
      temperature: 0,
    };
    if (job.prompt?.trim()) body.prompt = job.prompt.trim().slice(0, 800);

    const response = await Promise.race([
      client.audio.transcriptions.create(body),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Cloud transcription exceeded ${job.timeoutMs}ms`)), job.timeoutMs);
      }),
    ]);
    const text = (response as unknown as string).trim();
    const ms = Math.round(performance.now() - t0);
    if (!text) return { ok: false, error: "emptyTranscription", ms };
    return { ok: true, text, ms };
  } catch (err) {
    const ms = Math.round(performance.now() - t0);
    return { ok: false, error: err instanceof Error ? err.message : String(err), ms };
  }
}

parentPort?.on("message", (job: Job) => {
  void run(job).then((result) => parentPort?.postMessage(result));
});
