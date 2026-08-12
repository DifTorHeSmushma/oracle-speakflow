#Requires -Version 5.1
<#
.SYNOPSIS
  Oracle SpeakFlow (OSF) -- single-script live latency proof for Dom's daily study stack.

.DESCRIPTION
  ============================================================================
  WHAT ORACLE SPEAKFLOW IS
  ============================================================================
  Oracle SpeakFlow (OSF) is a Windows-first, open-source, hands-free speech-to-text tray app.
  You speak into the mic; Silero VAD detects utterance boundaries; audio is transcribed
  (default: Groq whisper-large-v3-turbo); light correction / dictionary runs; text is pasted
  into whatever app already has focus (Cursor, Notion, browser, Word, terminal, etc.).

  Dom's daily path (agentic engineering + data-analysis course study):
    1. Focus Cursor / notes / course doc
    2. Speak a brain-dump (short prompt OR ~20-45s reasoning aloud)
    3. OSF pastes corrected text within a few seconds of the last word
    4. Keep coding / analyzing -- no typing the dump by hand

  Perfect behavior (Aug 8 2026 ~17:22 baseline, unpackaged Electron, worker path):
    - ~4-5s utterance  -> transcribeWall ~1-3s, paste ~2-3s, delivered=true
    - ~19-20s dump     -> transcribeWall ~1s (speculative overlap), paste ~3s, delivered=true
    - No red "Network timeout"; logs show via=worker (not main-thread Groq starved by ORT)

  ============================================================================
  WHAT BROKE (Sat Aug 8 ~23:05 packaged .exe)
  ============================================================================
  Installing Oracle SpeakFlow.exe switched logs to %APPDATA%\oracle-speakflow\latency.jsonl.
  SPEAKFLOW_GROQ_WORKER=1 was on, but groqTranscribeWorker lived in app.asar.unpacked while
  groq-sdk stayed inside app.asar -> Worker threw:
      Cannot find package 'groq-sdk'
  Code silently fell back to main-thread Groq -> Silero/ORT starvation -> 8-40s walls,
  then ~45s dumps hit the 20s finalize ceiling twice -> UI "Network timeout", empty transcript.

  ============================================================================
  WHAT WE FIXED (this repo / installed build)
  ============================================================================
  1. Bundle the Groq worker with esbuild as CJS (embeds groq-sdk):
       dist/services/groqTranscribeWorker.cjs
  2. asarUnpack that .cjs; resolve via asarUnpacked() in transcription.ts
  3. Worker ON by default (SPEAKFLOW_GROQ_WORKER=0 only to force main-thread debug)
  4. proof-packaged-worker.mjs proves installed worker loads + finishes under finalize ceiling
  5. THIS SCRIPT proves the LIVE packaged path with ONE continuous acoustic dump per duration

  ============================================================================
  HOW THIS TEST WORKS (ONE SCRIPT -- NO SPEAK LOOPS)
  ============================================================================
  - Builds TWO different unique monologues (agentic engineering vs data-analysis course).
  - Speaks each monologue ONCE to a WAV (SAPI), resamples with ffmpeg -- NO stream_loop,
    NO repeating the same conversation to pad duration.
  - Plays each WAV ONCE through speakers while OSF listens.
  - Focuses Notepad so paste can deliver.
  - Waits for the latency cycle whose audioSec matches that unique WAV.
  - Pass gates:
      * via=worker (no Cannot find package groq-sdk, no main-thread fallback)
      * ok=true, delivered=true
      * ~20s: audioSec ~20, wallMs <= 5000 (Aug 8 ~19.55s was wall~1036ms)
      * ~45s: audioSec ~45, ok=true (no Network timeout death spiral)

.NOTES
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\latency-proof-domenic-study.ps1
  npm run proof:domenic-latency

  Requires: packaged install, GROQ_API_KEY, ffmpeg+ffplay on PATH, mic that can hear speakers.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$InstallRoot = Join-Path $env:LOCALAPPDATA "Programs\Oracle SpeakFlow"
$Exe         = Join-Path $InstallRoot "Oracle SpeakFlow.exe"
$WorkerCjs   = Join-Path $InstallRoot "resources\app.asar.unpacked\dist\services\groqTranscribeWorker.cjs"
$EnvFile     = Join-Path $env:APPDATA "oracle-speakflow\.env"
$LatencyLog  = Join-Path $env:APPDATA "oracle-speakflow\latency.jsonl"
$StderrLog   = Join-Path $env:TEMP "osf-domenic-latency-stderr.log"
$StdoutLog   = Join-Path $env:TEMP "osf-domenic-latency-stdout.log"
$ReportPath  = Join-Path $env:TEMP "osf-domenic-latency-report.txt"
$WorkDir     = Join-Path $env:TEMP "osf-domenic-latency-wav"

$MaxWallMs20 = 5000
$RequireOk45 = $true

function Write-Banner([string]$Title) {
  Write-Host ""
  Write-Host ("=" * 72) -ForegroundColor Cyan
  Write-Host $Title -ForegroundColor Cyan
  Write-Host ("=" * 72) -ForegroundColor Cyan
}

function Resolve-Bin([string]$Name) {
  $r = & where.exe $Name 2>$null | Select-Object -First 1
  if (-not $r) { throw ("{0} not found on PATH" -f $Name) }
  return $r.Trim()
}

function Assert-Preflight {
  Write-Banner "PREFLIGHT -- packaged OSF + worker bundle"
  if (-not (Test-Path -LiteralPath $Exe)) {
    throw ("Missing packaged exe: {0}" -f $Exe)
  }
  if (-not (Test-Path -LiteralPath $WorkerCjs)) {
    throw ("Missing bundled worker: {0}" -f $WorkerCjs)
  }
  $workerBytes = (Get-Item -LiteralPath $WorkerCjs).Length
  if ($workerBytes -lt 100000) {
    throw ("Worker too small ({0} bytes) -- expected esbuild-bundled .cjs" -f $workerBytes)
  }
  if (-not (Test-Path -LiteralPath $EnvFile)) {
    throw ("Missing {0}" -f $EnvFile)
  }
  $envText = Get-Content -LiteralPath $EnvFile -Raw
  if ($envText -notmatch '(?m)^GROQ_API_KEY=\S+') {
    throw ("GROQ_API_KEY missing in {0}" -f $EnvFile)
  }
  if (-not (Test-Path -LiteralPath $LatencyLog)) {
    New-Item -ItemType File -Path $LatencyLog -Force | Out-Null
  }
  $null = Resolve-Bin "ffmpeg"
  $null = Resolve-Bin "ffplay"
  New-Item -ItemType Directory -Path $WorkDir -Force | Out-Null
  Write-Host ("exe:     {0}" -f $Exe)
  Write-Host ("worker:  {0} ({1} bytes)" -f $WorkerCjs, $workerBytes)
  Write-Host ("latency: {0}" -f $LatencyLog)
  Write-Host ("workdir: {0}" -f $WorkDir)
  Write-Host ""
  Write-Host "OSF: hands-free STT -> Groq worker -> paste into Cursor / course notes."
  Write-Host "Fix: packaged worker embeds groq-sdk (asar Cannot find package is gone)."
}

function Stop-SpeakFlow {
  Get-Process | Where-Object {
    $_.ProcessName -eq "Oracle SpeakFlow" -or
    ($_.Path -and $_.Path -like "*Oracle SpeakFlow*")
  } | ForEach-Object {
    try { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } catch {}
  }
  Start-Sleep -Seconds 2
}

function Start-SpeakFlowLogged {
  Write-Banner "LAUNCH -- packaged Oracle SpeakFlow (stderr captured)"
  Stop-SpeakFlow
  Remove-Item -LiteralPath $StderrLog, $StdoutLog -Force -ErrorAction SilentlyContinue
  $p = Start-Process -FilePath $Exe `
    -RedirectStandardError $StderrLog `
    -RedirectStandardOutput $StdoutLog `
    -PassThru
  Write-Host ("started pid={0}" -f $p.Id)
  $deadline = (Get-Date).AddSeconds(25)
  $armed = $false
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 400
    if (Test-Path -LiteralPath $StderrLog) {
      $tail = Get-Content -LiteralPath $StderrLog -Raw -ErrorAction SilentlyContinue
      if ($tail -match "vad\] armed|hands-free|Oracle SpeakFlow") {
        $armed = $true
        break
      }
    }
  }
  if (-not $armed) {
    Write-Host ("WARN: VAD not armed yet -- check {0}" -f $StderrLog)
  } else {
    Write-Host "VAD/capture armed."
  }
  Start-Sleep -Seconds 2
}

function Focus-Notepad {
  $sysNp = Join-Path $env:SystemRoot "System32\notepad.exe"
  Start-Process -FilePath $sysNp | Out-Null
  Start-Sleep -Seconds 1.5
  $np = Get-Process -Name "notepad" -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } |
    Select-Object -First 1
  if (-not $np) { throw "Notepad did not open with a main window." }
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class OsfFocus {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
}
"@ -ErrorAction SilentlyContinue
  [void][OsfFocus]::SetForegroundWindow([IntPtr]$np.MainWindowHandle)
  Start-Sleep -Milliseconds 500
  return $np
}

function Get-UniqueStudyMonologue([string]$Kind) {
  <#
    TWO different study dumps -- never reuse / never stream_loop the same conversation.
    Kind agentic20  = ~20s agentic-engineering dump (unique sentences).
    Kind analysis45 = ~45s data-analysis dump (different topic and wording entirely).
  #>
  switch ($Kind) {
    "agentic20" {
      return @(
        "Domenic is using Oracle SpeakFlow while studying agentic engineering.",
        "Today the goal is to keep last-word to paste fast enough that planning stays unbroken.",
        "The agent must read the contract, pick tools, gather evidence, and only then edit code.",
        "I am checking that the packaged Groq worker embeds the SDK so asar never fails to resolve it.",
        "If transcription falls back to the main thread, Silero ONNX starves HTTP and dumps feel broken.",
        "This twenty second dump is a single unique monologue, not a repeated phrase loop.",
        "Paste into Notepad for the harness, then return to Cursor for the real study session."
      ) -join " "
    }
    "analysis45" {
      return @(
        "Now switching topics completely for the data analysis course brain dump.",
        "I need notes on how sampling frames create selection bias before any model is fit.",
        "Variance and bias trade off when we shrink estimators, so report both error sources.",
        "Causal claims need a design story, not only a significant p-value on observational data.",
        "Plot residuals, check leverage, and ask whether the unit of analysis matches the question.",
        "For categorical outcomes, calibrate probabilities instead of chasing raw accuracy alone.",
        "When features leak future information, cross-validation scores become dishonestly optimistic.",
        "Document the preprocessing steps so another student can reproduce the exact table.",
        "Oracle SpeakFlow should paste this longer analysis dump without a network timeout.",
        "Worker-thread Groq keeps dictation usable while Silero still watches for speech end.",
        "This forty five second monologue uses different sentences from the agentic dump above.",
        "No audio looping, no repeated conversation, one continuous unique study narration only.",
        "After paste delivery, I will skim latency.jsonl for via worker and delivered true flags."
      ) -join " "
    }
    default { throw ("Unknown monologue kind: {0}" -f $Kind) }
  }
}

function New-UniqueDumpWav([string]$Kind, [string]$OutPath) {
  <#
    Speak ONE unique monologue once into a WAV (no stream_loop, no phrase repeat).
    ffmpeg only resamples to 16 kHz mono -- it does NOT loop or pad with the same audio.
  #>
  $prose = Get-UniqueStudyMonologue -Kind $Kind
  Write-Host ("monologue kind={0} chars={1} (unique text, spoken once)" -f $Kind, $prose.Length)

  $raw = Join-Path $WorkDir ("raw-{0}.wav" -f $Kind)
  $proseFile = Join-Path $WorkDir ("prose-{0}.txt" -f $Kind)
  # UTF-8 no BOM can confuse some hosts; use Unicode for SAPI child
  Set-Content -LiteralPath $proseFile -Value $prose -Encoding Unicode

  $rawEsc = $raw.Replace("'", "''")
  $proseEsc = $proseFile.Replace("'", "''")
  $ps = @"
Add-Type -AssemblyName System.Speech
`$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
`$s.Rate = 0
`$text = Get-Content -LiteralPath '$proseEsc' -Raw -Encoding Unicode
`$s.SetOutputToWaveFile('$rawEsc')
`$s.Speak(`$text)
`$s.Dispose()
"@
  $null = & powershell.exe -NoProfile -NonInteractive -Command $ps
  if (-not (Test-Path -LiteralPath $raw)) {
    throw ("SAPI unique WAV failed for kind={0}" -f $Kind)
  }

  $ff = Resolve-Bin "ffmpeg"
  # Resample only. Optional silenceremove tightens SAPI gaps so VAD keeps one utterance.
  $ffArgs = @(
    "-y", "-i", $raw,
    "-af", "silenceremove=start_periods=0:stop_periods=0:stop_duration=0.15:stop_threshold=-40dB",
    "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
    $OutPath
  )
  $ffOut = Join-Path $WorkDir "ffmpeg-out.txt"
  $ffErr = Join-Path $WorkDir "ffmpeg-err.txt"
  $fp = Start-Process -FilePath $ff -ArgumentList $ffArgs -Wait -PassThru -NoNewWindow `
    -RedirectStandardOutput $ffOut -RedirectStandardError $ffErr
  if ($fp.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $OutPath)) {
    $errTail = if (Test-Path $ffErr) { Get-Content $ffErr -Raw } else { "" }
    throw ("ffmpeg resample failed exit={0}: {1}" -f $fp.ExitCode, $errTail)
  }
  $bytes = (Get-Item -LiteralPath $OutPath).Length
  $audioSec = [Math]::Round(($bytes - 44) / 32000.0, 2)
  Write-Host ("wav {0} bytes={1} ~{2}s (unique monologue once -- NO stream_loop)" -f $OutPath, $bytes, $audioSec)
  return @{ audioSec = $audioSec; proseChars = $prose.Length; kind = $Kind }
}

function Play-WavOnce([string]$WavPath) {
  $ffplay = Resolve-Bin "ffplay"
  # Blocking play once; -nodisp keeps UI quiet; -autoexit ends with file
  $p = Start-Process -FilePath $ffplay -ArgumentList @(
    "-nodisp", "-autoexit", "-loglevel", "quiet", $WavPath
  ) -PassThru -WindowStyle Hidden
  $null = $p.WaitForExit(180000)
  if (-not $p.HasExited) {
    try { Stop-Process -Id $p.Id -Force } catch {}
    throw "ffplay did not finish within timeout"
  }
}

function Wait-MatchingCycle([long]$ByteOffset, [int]$TargetSec, [int]$TimeoutSec) {
  # Collect cycles after offset; return the one whose audioSec is closest to TargetSec
  # among those within 55%-125% of target (avoids grabbing a short VAD fragment).
  $dead = (Get-Date).AddSeconds($TimeoutSec)
  $best = $null
  $minRatio = 0.55
  $maxRatio = 1.30
  while ((Get-Date) -lt $dead) {
    Start-Sleep -Milliseconds 300
    $cycles = @()
    $fs = [System.IO.File]::Open($LatencyLog, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    try {
      if ($ByteOffset -ge $fs.Length) { continue }
      $fs.Position = $ByteOffset
      $sr = New-Object System.IO.StreamReader($fs)
      $se = $null; $tr = $null
      while ($null -ne ($line = $sr.ReadLine())) {
        try {
          $e = $line | ConvertFrom-Json
          switch ($e.event) {
            "speech_end"      { $se = $e; $tr = $null }
            "transcribe_done" { $tr = $e }
            "paste_complete" {
              if ($se -and $tr) {
                $cycles += @{ se = $se; tr = $tr; paste = $e }
              }
              $se = $null; $tr = $null
            }
          }
        } catch {}
      }
    } finally { $fs.Dispose() }

    foreach ($c in $cycles) {
      $a = [double]$c.se.audioSec
      if ($a -ge ($TargetSec * $minRatio) -and $a -le ($TargetSec * $maxRatio)) {
        if (-not $best -or [Math]::Abs($a - $TargetSec) -lt [Math]::Abs([double]$best.se.audioSec - $TargetSec)) {
          $best = $c
        }
      }
    }
    # Prefer returning once we have a match AND some settle time after playback
    if ($best -and $best.tr.ok -ne $null) {
      return $best
    }
  }
  return $best
}

function Get-RecentWorkerLines([int]$Count = 15) {
  if (-not (Test-Path -LiteralPath $StderrLog)) { return @() }
  return @(Select-String -Path $StderrLog -Pattern "cloud-transcribe:|groq-worker|Cannot find package" |
    Select-Object -Last $Count |
    ForEach-Object { $_.Line })
}

function Invoke-ContinuousDump {
  param(
    [Parameter(Mandatory)][string]$Label,
    [Parameter(Mandatory)][string]$MonologueKind,
    [Parameter(Mandatory)][int]$TargetSecHint,
    [Parameter(Mandatory)][int]$MaxWallMs,
    [Parameter(Mandatory)][bool]$RequireFastWall
  )

  Write-Banner ("LIVE DUMP -- {0} (unique monologue kind={1}, play ONCE)" -f $Label, $MonologueKind)
  $np = Focus-Notepad
  Write-Host ("Notepad pid={0} hwnd={1}" -f $np.Id, $np.MainWindowHandle)

  $wav = Join-Path $WorkDir ("dump-{0}.wav" -f $MonologueKind)
  $made = New-UniqueDumpWav -Kind $MonologueKind -OutPath $wav
  $wavSec = [double]$made.audioSec
  if ($wavSec -lt ($TargetSecHint * 0.55)) {
    throw ("Unique monologue too short ({0}s) for hint {1}s -- add more DISTINCT sentences to kind {2}." -f $wavSec, $TargetSecHint, $MonologueKind)
  }

  $before = (Get-Item -LiteralPath $LatencyLog).Length
  Write-Host ("Playing ONCE unique WAV (~{0}s) -- mic must hear speakers..." -f $wavSec)
  $t0 = Get-Date
  Play-WavOnce -WavPath $wav
  $playSec = [Math]::Round(((Get-Date) - $t0).TotalSeconds, 1)
  Write-Host ("playSec={0}" -f $playSec)

  Start-Sleep -Seconds 4
  $matchSec = [int][Math]::Round($wavSec)
  $wait = [Math]::Max(60, $matchSec + 50)
  $r = Wait-MatchingCycle -ByteOffset $before -TargetSec $matchSec -TimeoutSec $wait

  $workerLines = Get-RecentWorkerLines
  $workerLines | ForEach-Object { Write-Host $_ }

  $summary = [ordered]@{
    label            = $Label
    monologueKind    = $MonologueKind
    targetSecHint    = $TargetSecHint
    wavSec           = $wavSec
    playSec          = $playSec
    audioSec         = $(if ($r -and $r.se) { $r.se.audioSec } else { $null })
    ortRunMsLast     = $(if ($r -and $r.se) { $r.se.ortRunMsLast } else { $null })
    speculativeReuse = $(if ($r -and $r.se) { $r.se.speculativeReuse } else { $null })
    wallMs           = $(if ($r -and $r.tr) { $r.tr.transcribeWallMs } else { $null })
    specWaitMs       = $(if ($r -and $r.tr) { $r.tr.specWaitMs } else { $null })
    ok               = $(if ($r -and $r.tr) { $r.tr.ok } else { $null })
    errKind          = $(if ($r -and $r.tr) { $r.tr.errKind } else { $null })
    settleSource     = $(if ($r -and $r.tr) { $r.tr.settleSource } else { $null })
    pasteMs          = $(if ($r -and $r.paste) { $r.paste.pasteCompleteMs } else { $null })
    delivered        = $(if ($r -and $r.paste) { $r.paste.delivered } else { $null })
    textChars        = $(if ($r -and $r.paste) { $r.paste.textChars } else { $null })
    viaWorker        = [bool]($workerLines | Where-Object { $_ -match "via=worker" })
    missingSdk       = [bool]($workerLines | Where-Object { $_ -match "Cannot find package 'groq-sdk'" })
    mainFallback     = [bool]($workerLines | Where-Object { $_ -match "main-thread fallback|falling back to main thread" })
  }

  Write-Host ""
  Write-Host ($summary | ConvertTo-Json -Compress)

  $failures = @()
  if (-not $r) { $failures += ("no matching latency cycle near ~{0}s audio" -f $matchSec) }
  if ($summary.missingSdk) { $failures += "groq-sdk still unresolved in worker" }
  if ($summary.mainFallback) { $failures += "worker fell back to main-thread Groq" }
  if (-not $summary.viaWorker) { $failures += "no via=worker line in stderr" }
  if ($summary.ok -ne $true) { $failures += ("transcribe ok!=true (err={0})" -f $summary.errKind) }
  if ($summary.delivered -ne $true) { $failures += "paste not delivered" }
  if ($RequireFastWall -and $null -ne $summary.wallMs -and $summary.wallMs -gt $MaxWallMs) {
    $failures += ("wall {0}ms > Aug8-class gate {1}ms" -f $summary.wallMs, $MaxWallMs)
  }
  if ($null -eq $summary.audioSec -or $summary.audioSec -lt ($wavSec * 0.55)) {
    $failures += ("audioSec={0} not near unique wavSec={1}" -f $summary.audioSec, $wavSec)
  }

  return @{ summary = $summary; failures = $failures }
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
Write-Banner "Oracle SpeakFlow -- Domenic study latency proof (single script)"
Write-Host @"
Context: Dom uses OSF daily for agentic engineering + data-analysis course dumps.
Goal: packaged .exe matches Aug 8 17:22 worker speed class -- not the 23:05 regression.
Method: TWO different unique monologues, each spoken once to WAV and played ONCE.
        No stream_loop. No repeating the same conversation.
"@

Assert-Preflight
Start-SpeakFlowLogged

$allFailures = @()
$results = @()

# Dump A: unique agentic-engineering monologue (~20s class)
$r20 = Invoke-ContinuousDump -Label "agentic-study-dump" -MonologueKind "agentic20" -TargetSecHint 20 -MaxWallMs $MaxWallMs20 -RequireFastWall $true
$results += $r20.summary
$allFailures += $r20.failures

Start-Sleep -Seconds 6

# Dump B: DIFFERENT data-analysis monologue (~45s class) -- not the same text stretched/looped
$r45 = Invoke-ContinuousDump -Label "analysis-course-dump" -MonologueKind "analysis45" -TargetSecHint 45 -MaxWallMs 20000 -RequireFastWall $false
$results += $r45.summary
$allFailures += $r45.failures
if ($RequireOk45 -and $r45.summary.ok -ne $true) {
  $allFailures += "analysis dump must ok=true (no Network timeout death spiral)"
}

Write-Banner "REPORT"
$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$resultsJson = ($results | ConvertTo-Json -Depth 4)
$failText = if ($allFailures.Count) { ($allFailures | ForEach-Object { " - $_" }) -join "`n" } else { " (none)" }
$report = @"
Oracle SpeakFlow -- Domenic study latency proof
Generated: $stamp

What OSF is: hands-free STT tray app -> Groq (worker) -> paste into focused study app.
What broke: packaged worker could not resolve groq-sdk from asar -> silent main-thread fallback.
What fixed: esbuild-bundled groqTranscribeWorker.cjs + asarUnpack + worker default ON.

Aug 8 17:22 baseline (Electron): ~19.55s audio -> wall~1036ms, paste~3159ms, delivered=true.
Regression (Aug 8 23:05 packaged): long dumps -> Network timeout / 8-40s walls.

Results:
$resultsJson

Failures:
$failText
"@
Set-Content -LiteralPath $ReportPath -Value $report -Encoding UTF8
Write-Host $report
Write-Host ""
Write-Host ("Report written: {0}" -f $ReportPath)

if ($allFailures.Count -gt 0) {
  Write-Host "FAIL -- see failures above" -ForegroundColor Red
  exit 1
}
Write-Host "PASS -- packaged worker live path OK for Dom study dumps" -ForegroundColor Green
exit 0
