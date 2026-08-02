/**
 * Thai + English STT probe for SpeakFlow / Groq.
 * Usage: node scripts/thai-stt-probe.mjs
 * Requires: GROQ_API_KEY in env or %APPDATA%/Electron/.env or oracle-speakflow/.env
 *           edge-tts + ffmpeg on PATH
 */
import { spawnSync, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import Groq from "groq-sdk";

const OUT = join(process.cwd(), "tmp", "thai-probe");
const ROUNDS = Number(process.env.THAI_PROBE_ROUNDS || "2");
const MODEL = process.env.SPEAKFLOW_MODEL || "whisper-large-v3-turbo";
const VOICE = process.env.THAI_TTS_VOICE || "th-TH-PremwadeeNeural";
const EN_VOICE = process.env.EN_TTS_VOICE || "en-US-JennyNeural";
const PACING_MS = Number(process.env.THAI_PROBE_PACE_MS || "8000");

const THAI = [
  "สวัสดีครับ วันนี้อากาศดีมาก",
  "ขอโทษนะครับ ช่วยพูดช้าลงหน่อยได้ไหม",
  "ขอบคุณมากครับ ที่ช่วยเหลือฉัน",
  "วันนี้ผมจะไปตลาดซื้อผลไม้",
  "คุณกินข้าวแล้วหรือยัง",
  "โรงเรียนอยู่ใกล้บ้านของฉัน",
  "โปรดส่งอีเมลหาฉันพรุ่งนี้เช้า",
  "ราคาเท่าไหร่ครับ สำหรับสองชิ้น",
  "ผมอยากนัดหมายกับแพทย์วันจันทร์",
  "น้ำเปล่าหนึ่งขวดและข้าวผัดไก่ครับ",
  "ลูกๆ ทำการบ้านเสร็จแล้วหรือยัง",
  "ผมทำงานที่ออฟฟิศจนถึงหกโมงเย็น",
  "กรุณาปิดประตูด้วยนะคะ",
  "พรุ่งนี้ฝนอาจจะตกทั้งวัน",
  "ช่วยบันทึกการประชุมลงในเอกสารด้วย",
  "ฉันชอบกินส้มตำและข้าวเหนียว",
  "ตอนนี้กี่โมงแล้วครับ",
  "อย่าลืมชาร์จแบตเตอรี่โทรศัพท์",
  "ยินดีต้อนรับสู่กรุงเทพมหานคร",
  "วันนี้อยากกินต้มยำกุ้งและข้าวสวย",
];

const ENGLISH = [
  "Please paste this sentence into the editor carefully.",
  "Oracle SpeakFlow should still work perfectly in English.",
  "The weather is nice and I will send the email tomorrow.",
  "Focus the target app before speaking for best results.",
  "Dictionary entries fix names that Whisper often gets wrong.",
];

function loadApiKey() {
  if (process.env.GROQ_API_KEY?.trim()) return process.env.GROQ_API_KEY.trim();
  const candidates = [
    join(homedir(), "AppData", "Roaming", "Electron", ".env"),
    join(homedir(), "AppData", "Roaming", "oracle-speakflow", ".env"),
    join(process.cwd(), ".env"),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const m = readFileSync(p, "utf8").match(/^GROQ_API_KEY=(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("GROQ_API_KEY not found");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function synth(text, voice, outMp3) {
  const txtPath = outMp3.replace(/\.mp3$/i, ".txt");
  writeFileSync(txtPath, text, "utf8");
  const r = spawnSync(
    process.platform === "win32" ? "edge-tts.exe" : "edge-tts",
    ["--voice", voice, "--file", txtPath, "--write-media", outMp3],
    { encoding: "utf8", shell: false }
  );
  if (r.status !== 0) {
    // Fallback: python -m edge_tts (Windows PATH quirks)
    const r2 = spawnSync(
      "python",
      ["-m", "edge_tts", "--voice", voice, "--file", txtPath, "--write-media", outMp3],
      { encoding: "utf8", shell: false }
    );
    if (r2.status !== 0) {
      throw new Error(`edge-tts failed: ${(r.stderr || r.stdout || "") + (r2.stderr || r2.stdout || "")}`);
    }
  }
}

function mp3ToWav(mp3, wav) {
  execFileSync(
    "ffmpeg",
    ["-y", "-i", mp3, "-ac", "1", "-ar", "16000", "-f", "wav", wav],
    { stdio: "ignore" }
  );
}

async function transcribe(client, wavPath, language) {
  const buf = readFileSync(wavPath);
  const file = new File([buf], "probe.wav", { type: "audio/wav" });
  const lang = language.trim().toLowerCase();
  const t0 = performance.now();
  const response = await client.audio.transcriptions.create({
    file,
    model: MODEL,
    ...(lang && lang !== "auto" ? { language: lang } : {}),
    response_format: "text",
  });
  const ms = Math.round(performance.now() - t0);
  const text = String(response).trim();
  return { text, ms };
}

function thaiChars(s) {
  return (s.match(/[\u0E00-\u0E7F]/g) || []).join("");
}

function scoreThai(expected, got) {
  const e = thaiChars(expected);
  const g = thaiChars(got);
  if (!e) return { ok: false, reason: "no-thai-expected" };
  if (!g) return { ok: false, reason: "no-thai-in-transcript" };
  // Containment / overlap of unique chars (rough, conversational)
  let hit = 0;
  const set = new Set(g);
  for (const ch of new Set(e)) if (set.has(ch)) hit++;
  const ratio = hit / new Set(e).size;
  return { ok: ratio >= 0.45 && g.length >= Math.min(6, e.length * 0.3), ratio, reason: `overlap=${ratio.toFixed(2)}` };
}

function scoreEn(expected, got) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const e = norm(expected);
  const g = norm(got);
  const words = e.split(" ").filter(Boolean);
  const hits = words.filter((w) => g.includes(w)).length;
  const ratio = words.length ? hits / words.length : 0;
  return { ok: ratio >= 0.6, ratio, reason: `word-hit=${ratio.toFixed(2)}` };
}

mkdirSync(OUT, { recursive: true });
const client = new Groq({ apiKey: loadApiKey(), timeout: 60_000 });
const results = [];
const started = Date.now();
const targetEnd = started + 15 * 60 * 1000;

console.log(`Thai STT probe — model=${MODEL} rounds=${ROUNDS} pace=${PACING_MS}ms out=${OUT}`);

let round = 0;
while (round < ROUNDS && Date.now() < targetEnd) {
  round++;
  console.log(`\n=== ROUND ${round} ===`);
  for (let i = 0; i < THAI.length && Date.now() < targetEnd; i++) {
    const text = THAI[i];
    const base = join(OUT, `th-r${round}-${String(i + 1).padStart(2, "0")}`);
    const mp3 = `${base}.mp3`;
    const wav = `${base}.wav`;
    process.stdout.write(`TH ${i + 1}/${THAI.length} … `);
    try {
      synth(text, VOICE, mp3);
      mp3ToWav(mp3, wav);
      const { text: got, ms } = await transcribe(client, wav, "th");
      const sc = scoreThai(text, got);
      results.push({ lang: "th", round, i: i + 1, expected: text, got, ms, ...sc });
      console.log(`${sc.ok ? "PASS" : "FAIL"} ${ms}ms | ${got.slice(0, 60)}`);
    } catch (err) {
      results.push({ lang: "th", round, i: i + 1, expected: text, got: "", ok: false, reason: String(err) });
      console.log(`ERR ${err}`);
    }
    await sleep(Math.min(PACING_MS, Math.max(0, targetEnd - Date.now())));
  }
  for (let i = 0; i < ENGLISH.length && Date.now() < targetEnd; i++) {
    const text = ENGLISH[i];
    const base = join(OUT, `en-r${round}-${String(i + 1).padStart(2, "0")}`);
    const mp3 = `${base}.mp3`;
    const wav = `${base}.wav`;
    process.stdout.write(`EN ${i + 1}/${ENGLISH.length} … `);
    try {
      synth(text, EN_VOICE, mp3);
      mp3ToWav(mp3, wav);
      const { text: got, ms } = await transcribe(client, wav, "en");
      const sc = scoreEn(text, got);
      results.push({ lang: "en", round, i: i + 1, expected: text, got, ms, ...sc });
      console.log(`${sc.ok ? "PASS" : "FAIL"} ${ms}ms | ${got.slice(0, 72)}`);
    } catch (err) {
      results.push({ lang: "en", round, i: i + 1, expected: text, got: "", ok: false, reason: String(err) });
      console.log(`ERR ${err}`);
    }
    await sleep(Math.min(PACING_MS, Math.max(0, targetEnd - Date.now())));
  }
}

const th = results.filter((r) => r.lang === "th");
const en = results.filter((r) => r.lang === "en");
const summary = {
  elapsedMin: ((Date.now() - started) / 60000).toFixed(1),
  thai: { n: th.length, pass: th.filter((r) => r.ok).length },
  english: { n: en.length, pass: en.filter((r) => r.ok).length },
  results,
};
writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
console.log("\n=== SUMMARY ===");
console.log(`elapsed ${summary.elapsedMin} min`);
console.log(`Thai    ${summary.thai.pass}/${summary.thai.n}`);
console.log(`English ${summary.english.pass}/${summary.english.n}`);
console.log(`wrote ${join(OUT, "summary.json")}`);
if (summary.english.pass < summary.english.n) process.exitCode = 2;
if (summary.thai.pass < Math.ceil(summary.thai.n * 0.7)) process.exitCode = 3;
