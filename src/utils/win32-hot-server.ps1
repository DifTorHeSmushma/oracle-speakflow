$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class SfHot {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool f);
  public static string Fg() {
    var hw = GetForegroundWindow();
    uint pid = 0;
    GetWindowThreadProcessId(hw, out pid);
    var sb = new StringBuilder(256);
    GetClassName(hw, sb, 256);
    return hw.ToString() + "|" + sb.ToString() + "|" + pid.ToString();
  }
  public static bool Restore(IntPtr target) {
    if (!IsWindow(target)) return false;
    ShowWindow(target, 9);
    IntPtr fg = GetForegroundWindow();
    uint fgPid;
    uint fgTid = GetWindowThreadProcessId(fg, out fgPid);
    uint self = GetCurrentThreadId();
    bool attached = false;
    if (fgTid != 0 && fgTid != self) attached = AttachThreadInput(self, fgTid, true);
    try {
      BringWindowToTop(target);
      return SetForegroundWindow(target);
    } finally {
      if (attached) AttachThreadInput(self, fgTid, false);
    }
  }
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr extra);
  public static void CtrlV() {
    const byte VK_CONTROL = 0x11;
    const byte VK_V = 0x56;
    const uint KEYUP = 2;
    keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
    keybd_event(VK_V, 0, 0, UIntPtr.Zero);
    keybd_event(VK_V, 0, KEYUP, UIntPtr.Zero);
    keybd_event(VK_CONTROL, 0, KEYUP, UIntPtr.Zero);
  }
}
"@
function Sf-ResolvePidName([uint32]$procId) {
  try {
    $p = Get-Process -Id $procId -EA Stop
    try { return $p.MainModule.ModuleName } catch { return ($p.Name + '.exe') }
  } catch { return '' }
}
[Console]::Out.WriteLine('__READY__')
[Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if ($line -eq 'QUIT') { break }
  try {
    if ($line -match '^FG\|(\d+)$') {
      $check = [IntPtr][int64]$Matches[1]
      $r = [SfHot]::Fg()
      $parts = $r -split '\|'
      $alive = [SfHot]::IsWindow($check)
      $pn = Sf-ResolvePidName([uint32]$parts[2])
      [Console]::Out.WriteLine(($parts[0] + '|' + $parts[1] + '|' + $pn + '|' + $alive))
    } elseif ($line -match '^RESTORE\|(\d+)$') {
      $hw = [IntPtr][int64]$Matches[1]
      if (-not [SfHot]::IsWindow($hw)) { [Console]::Out.WriteLine('dead') }
      elseif ([SfHot]::Restore($hw)) { [Console]::Out.WriteLine('ok') }
      else { [Console]::Out.WriteLine('fail') }
    } elseif ($line -eq 'CTRLV') {
      [SfHot]::CtrlV()
      [Console]::Out.WriteLine('ok')
    } elseif ($line -match '^PASTE\|(\d+)$') {
      $hw = [IntPtr][int64]$Matches[1]
      if (-not [SfHot]::IsWindow($hw)) { [Console]::Out.WriteLine('dead') }
      elseif (-not [SfHot]::Restore($hw)) { [Console]::Out.WriteLine('fail') }
      else {
        Start-Sleep -Milliseconds 15
        [SfHot]::CtrlV()
        [Console]::Out.WriteLine('ok')
      }
    } else {
      [Console]::Out.WriteLine('badcmd')
    }
  } catch {
    [Console]::Out.WriteLine('err')
  }
  [Console]::Out.Flush()
}
