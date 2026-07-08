/**
 * Architect's Gate verification script — drives all MCP methods over stdio.
 * Run: node scripts/test-mcp.mjs
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// On Windows .cmd wrappers need shell:true
const proc = spawn("node_modules\\.bin\\electron.cmd", ["dist/electron-main.js", "--mcp"], {
  cwd: root,
  stdio: ["pipe", "pipe", "pipe"],
  shell: true,
});

proc.stdout.on("data", (d) => {
  for (const line of d.toString().split("\n").filter(Boolean)) {
    try {
      const obj = JSON.parse(line);
      console.log(`[RESPONSE id=${obj.id}]`, JSON.stringify(obj.result ?? obj.error, null, 2));
    } catch {
      console.log("[RAW]", line);
    }
  }
});

proc.stderr.on("data", (d) => process.stderr.write(d));

const msgs = [
  { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "mcp-test", version: "1" } } },
  { jsonrpc: "2.0", method: "notifications/initialized" },
  { jsonrpc: "2.0", id: 2, method: "tools/list" },
  { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_last_transcript", arguments: {} } },
  { jsonrpc: "2.0", id: 4, method: "resources/list" },
  { jsonrpc: "2.0", id: 5, method: "resources/read", params: { uri: "transcripts://history" } },
];

let i = 0;
function send() {
  if (i < msgs.length) {
    proc.stdin.write(JSON.stringify(msgs[i++]) + "\n");
    setTimeout(send, 150);
  } else {
    setTimeout(() => proc.stdin.end(), 500);
  }
}
send();
proc.on("close", (code) => {
  console.log(`\n[MCP server exited with code ${code}]`);
});
