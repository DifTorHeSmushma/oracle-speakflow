/** Platform-correct bundled binary filename (ffmpeg vs ffmpeg.exe). */
export function resolveBundledBinaryName(base: string): string {
  return process.platform === "win32" ? `${base}.exe` : base;
}
