# LoomNote - one-click start (Windows PowerShell)
#
# Run it by double-clicking start.cmd in the repository root, or:
#     .\scripts\start.ps1
#
# Loads local configuration, makes sure the app is built, then launches Electron
# from this terminal. Launching from a terminal is deliberate: it keeps a
# host-injected ELECTRON_RUN_AS_NODE out of the app's environment.
#
# Extra arguments are passed through to Electron, e.g.:
#     .\scripts\start.ps1 --remote-debugging-port=9222

$ErrorActionPreference = "Continue"

try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Say  { param([string]$m) Write-Host "  $m" -ForegroundColor Cyan }
function Ok   { param([string]$m) Write-Host "  [ok] $m" -ForegroundColor Green }
function Warn { param([string]$m) Write-Host "  [!] $m" -ForegroundColor Yellow }
function Fail {
  param([string]$m, [string[]]$hints = @())
  Write-Host "  [x] $m" -ForegroundColor Red
  foreach ($h in $hints) { Write-Host "      $h" -ForegroundColor Gray }
  Write-Host ""
  # Keep the window alive when a double-click would otherwise close it.
  Wait-IfDoubleClicked
  exit 1
}

# A double-clicked script runs in a console that closes as soon as it ends.
# Never block a non-interactive run (CI, a piped shell).
function Wait-IfDoubleClicked {
  if ($Host.Name -ne 'ConsoleHost') { return }
  if (-not [Environment]::UserInteractive) { return }
  try { if ([Console]::IsInputRedirected) { return } } catch { return }
  $parent = try { (Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction Stop).ParentProcessId } catch { 0 }
  $isExplorer = $false
  if ($parent) {
    $isExplorer = try { (Get-Process -Id $parent -ErrorAction Stop).ProcessName -eq 'explorer' } catch { $false }
  }
  if ($isExplorer) {
    Write-Host "  You can close this window now." -ForegroundColor DarkGray
    Read-Host "  Press Enter"
  }
}

Write-Host ""
Write-Host "  LoomNote" -ForegroundColor White
Write-Host ""

# --------------------------------------------------------- local environment --
# config/local.env holds the API key and endpoint. It is git-ignored; the app
# also lets you set these in Settings, so a missing file is not an error.
$localEnv = Join-Path $RepoRoot "config\local.env"
if (Test-Path $localEnv) {
  Get-Content $localEnv | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]*)=(.*)$') {
      $name = $Matches[1].Trim()
      $value = $Matches[2].Trim()
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
  Ok "loaded config\local.env"
}

# Host environments such as DSH or VS Code inject this; it would turn Electron
# into a plain Node process and the window would never appear.
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

# A double-clicked window can carry a stale PATH. Refresh it from the registry so
# the app can find the plain Node.js its agent runtime needs.
$machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$merged = @($machinePath, $userPath) | Where-Object { $_ } | ForEach-Object { $_.TrimEnd(';') }
if ($merged) { $env:Path = ($merged -join ';') + ';' + $env:Path }
try {
  $npmPrefix = (& npm config get prefix 2>$null | Select-Object -First 1)
  if ($npmPrefix -and (Test-Path $npmPrefix) -and ($env:Path -notlike "*$npmPrefix*")) {
    $env:Path = "$npmPrefix;$env:Path"
  }
} catch {}

# The agent runtime needs a real Node.js; check early and say so plainly rather
# than letting the app start and fail on its first agent action.
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  $knownNode = @(
    (Join-Path $env:ProgramFiles "nodejs\node.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\nodejs\node.exe")
  ) | Where-Object { $_ -and (Test-Path $_) }
  if ($knownNode) {
    $env:Path = "$(Split-Path -Parent $knownNode[0]);$env:Path"
    $env:LOOMNOTE_NODE = $knownNode[0]
    Ok "found Node.js outside PATH: $($knownNode[0])"
  } else {
    Warn "No plain Node.js found. The app will open, but its agent runtime needs"
    Warn "Node.js 24+ (https://nodejs.org). Install it, then restart the app."
  }
}

# -------------------------------------------------------------------- build --
$main = "apps\desktop\out\main\index.js"
if (-not (Test-Path $main)) {
  Say "first run - building the app..."
  if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Fail "The app is not built and pnpm is not available." @("Run .\scripts\setup.ps1 first (or double-click setup.cmd).")
  }
  $env:CI = "true"
  & pnpm build
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $main)) {
    Fail "The build failed - read the output above." @("Run .\scripts\setup.ps1 to repair the environment.")
  }
  Ok "app built"
}

# ----------------------------------------------------------------- electron --
$bin = "apps\desktop\node_modules\electron\dist\electron.exe"
if (-not (Test-Path $bin)) { $bin = "apps\desktop\node_modules\electron\dist\Electron.exe" }
if (-not (Test-Path $bin)) {
  Fail "The Electron binary is missing." @(
    "Run the setup first: double-click setup.cmd or run .\scripts\setup.ps1",
    "Manual fix:",
    "  cd apps\desktop\node_modules\electron",
    "  `$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'; node install.js"
  )
}

# ------------------------------------------------------------------ launch --
Say "starting LoomNote..."
# ------------------------------------------------------------------ launch --
# Start-Process -Wait, not the call operator: PowerShell does not wait for a
# GUI subsystem process, so `& electron.exe ...` returns at once with a
# meaningless exit code and the script would report a failure that never
# happened. -Wait blocks for the real lifetime of the app.
Say "starting LoomNote..."
$electronArgs = @($main) + $args
$proc = $null
try {
  $proc = Start-Process -FilePath $bin -ArgumentList $electronArgs -PassThru -Wait
} catch {
  Warn "LoomNote could not be started: $($_.Exception.Message)"
  Wait-IfDoubleClicked
  exit 1
}

$rc = if ($proc) { $proc.ExitCode } else { 0 }
# Closing the window, or a forced kill, can surface as a negative code; that is
# not a failure worth alarming anyone about.
if ($rc -gt 0) {
  Write-Host ""
  Warn "LoomNote exited with code $rc."
  Warn "If the window never appeared, run with --remote-debugging-port=9222 and"
  Warn "open http://127.0.0.1:9222 to see the renderer, or check apps\desktop\data for logs."
  Wait-IfDoubleClicked
  exit $rc
}

Write-Host "  LoomNote closed." -ForegroundColor DarkGray
exit 0
