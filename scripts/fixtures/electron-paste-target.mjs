/**
 * Minimal Electron paste-target fixture for G-D1b (issue #11).
 * Opens a BrowserWindow with a textarea, writes its HWND + live text to temp files
 * so the harness can restore+Ctrl+V without SpeakFlow running.
 *
 * Usage: electron scripts/fixtures/electron-paste-target.mjs <workDir>
 */
import { app, BrowserWindow } from "electron";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const workDir = process.argv[2];
if (!workDir) {
  console.error("usage: electron electron-paste-target.mjs <workDir>");
  process.exit(2);
}

app.setPath("userData", join(workDir, "userdata"));

const hwndPath = join(workDir, "hwnd.txt");
const textPath = join(workDir, "text.txt");
const readyPath = join(workDir, "ready.txt");

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 640,
    height: 360,
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: "SpeakFlow-G-D1b-Target",
  });

  win.loadURL(
    "data:text/html;charset=utf-8," +
      encodeURIComponent(`<!doctype html>
<html><body style="margin:0;background:#111;color:#eee;font:16px sans-serif">
<textarea id="t" style="width:100%;height:100%;box-sizing:border-box;padding:12px;background:#1a1a1a;color:#eee;border:0"
  placeholder="paste target"></textarea>
<script>
  const t = document.getElementById('t');
  t.focus();
  window.__sfText = () => t.value;
</script>
</body></html>`)
  );

  win.webContents.once("did-finish-load", () => {
    // Decimal HWND string — same form SpeakFlow captures via getForegroundInfo().
    const buf = win.getNativeWindowHandle();
    const hwnd =
      process.arch === "x64" || process.arch === "arm64"
        ? buf.readBigUInt64LE(0).toString()
        : buf.readUInt32LE(0).toString();
    writeFileSync(hwndPath, hwnd, "utf8");
    writeFileSync(readyPath, "1", "utf8");
    console.log(`fixture ready hwnd=${hwnd}`);

    // Poll textarea → text file so the harness can prove delivery without CDP.
    setInterval(() => {
      win.webContents
        .executeJavaScript("window.__sfText ? window.__sfText() : ''")
        .then((text) => {
          writeFileSync(textPath, String(text ?? ""), "utf8");
        })
        .catch(() => undefined);
    }, 150);
  });
});

app.on("window-all-closed", () => app.quit());
