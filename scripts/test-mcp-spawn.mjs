/**
 * Architect's Gate: MCP spawn verification.
 * Mimics exactly how Claude Desktop / Cursor launches an MCP stdio server —
 * spawn with stdio:'pipe', send JSON-RPC messages, assert responses.
 *
 * Run: node scripts/test-mcp-spawn.mjs
 */
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const electronExe = join(root, "node_modules/electron/dist/electron.exe");

console.log("=== Oracle SpeakFlow MCP Gate Verification ===\n");

const proc = spawn(
  electronExe,
  [join(root, "dist/electron-main.js"), "--mcp"],
  {
    stdio: ["pipe", "pipe", "pipe"],
    // Do NOT use shell:true — real MCP clients spawn directly like this
  }
);

let stdout = "";
const results = [];

proc.stdout.on("data", (chunk) => {
  stdout += chunk.toString();
  // Parse complete JSON lines
  const lines = stdout.split("\n");
  stdout = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      results.push(msg);
      const method = requests[msg.id] ?? "unknown";
      console.log(`✓ [id=${msg.id}] ${method}:`);
      if (msg.result) {
        console.log("  " + JSON.stringify(msg.result).slice(0, 120));
      } else if (msg.error) {
        console.log("  ERROR: " + JSON.stringify(msg.error));
      }
    } catch {
      console.log("[RAW]", line);
    }
  }
});

proc.stderr.on("data", (d) => {
  const text = d.toString();
  // Only print MCP-level logs, not Chromium noise
  for (const line of text.split("\n")) {
    if (line.includes("[mcp]")) console.error(line);
  }
});

/** Map of id → method name for pretty printing */
const requests = {
  1: "initialize",
  2: "tools/list",
  3: "tools/call (get_last_transcript)",
  4: "resources/list",
  5: "resources/read (transcripts://history)",
};

const msgs = [
  { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "gate-test", version: "1" } } },
  { jsonrpc: "2.0", method: "notifications/initialized" },
  { jsonrpc: "2.0", id: 2, method: "tools/list" },
  { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_last_transcript", arguments: {} } },
  { jsonrpc: "2.0", id: 4, method: "resources/list" },
  { jsonrpc: "2.0", id: 5, method: "resources/read", params: { uri: "transcripts://history" } },
];

// Send one message per 200ms then close stdin
let i = 0;
function sendNext() {
  if (i >= msgs.length) {
    setTimeout(() => proc.stdin.end(), 400);
    return;
  }
  const msg = msgs[i++];
  proc.stdin.write(JSON.stringify(msg) + "\n");
  setTimeout(sendNext, 200);
}

// Wait for Electron to initialise before sending
setTimeout(sendNext, 1500);

proc.on("close", (code) => {
  console.log(`\n[Server exited with code ${code}]`);
  console.log(`\n=== Summary: ${results.length}/5 expected responses received ===`);
  const pass = results.length >= 5;
  console.log(pass ? "GATE: PASS ✓" : "GATE: FAIL ✗");
  process.exit(pass ? 0 : 1);
});

// Timeout after 15s
setTimeout(() => {
  console.error("\nTimeout — killing server");
  proc.kill();
}, 15000);
