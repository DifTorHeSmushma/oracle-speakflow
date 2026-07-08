import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const APP_ROOT = join(__dirname, "..");
const MAIN_JS = join(APP_ROOT, "dist", "electron-main.js");
const ELECTRON_PATH = join(APP_ROOT, "node_modules", ".bin", "electron.cmd");

console.log("Starting MCP spawn check...");

const child = spawn(ELECTRON_PATH, [MAIN_JS, "--mcp"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, GROQ_API_KEY: "sk-test" },
  shell: true
});

let output = "";
child.stdout.on("data", (data) => {
  output += data.toString();
  if (output.includes("jsonrpc")) {
    console.log("SUCCESS: MCP server responded with JSON-RPC");
    child.kill();
    process.exit(0);
  }
});

child.stderr.on("data", (data) => {
  const msg = data.toString();
  console.log(`[stderr] ${msg}`);
  if (msg.includes("MCP stdio server ready")) {
    console.log("SUCCESS: MCP server ready message detected");
    // Send a dummy request to trigger a response
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "notifications/initialized" }) + "\n");
    
    // Also try listing tools
    setTimeout(() => {
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n");
    }, 500);
  }
});

setTimeout(() => {
  console.error("TIMEOUT: MCP server did not respond within 10s");
  child.kill();
  process.exit(1);
}, 10000);
