# LoomNote - one-click setup (Windows PowerShell)
#
# Run it by double-clicking setup.cmd in the repository root, or:
#     .\scripts\setup.ps1
#
# It is written to work on a plain Windows machine: it checks the toolchain,
# installs what it can (pnpm), and explains exactly what to install when it
# cannot. Nothing outside this repository is modified except the user-level
# pnpm shim, which only happens when pnpm is missing.

# Native tools (git, npm, node) write to stderr on success too, so this script
# must not turn stderr into a terminating error - that is why it stays on
# Continue and checks $LASTEXITCODE itself.
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
  Write-Host "  Setup stopped - fix the item above and run it again." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "  LoomNote setup (Windows)" -ForegroundColor White
Write-Host "  repository: $RepoRoot" -ForegroundColor DarkGray
Write-Host ""

# ---------------------------------------------------------------- toolchain --
# Explorer double-clicks inherit the PATH of a possibly stale explorer.exe, so
# a freshly installed Node.js can be invisible. Re-read PATH from the registry
# before deciding that something is missing.
function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $merged = @($machine, $user) | Where-Object { $_ } | ForEach-Object { $_.TrimEnd(';') }
  if ($merged) { $env:Path = ($merged -join ';') + ';' + $env:Path }
}
Refresh-Path

# npm's global prefix is where a user-level pnpm lands; make sure the current
# process and any child process can see it.
try {
  $npmPrefix = (& npm config get prefix 2>$null | Select-Object -First 1)
  if ($npmPrefix -and (Test-Path $npmPrefix) -and ($env:Path -notlike "*$npmPrefix*")) {
    $env:Path = "$npmPrefix;$env:Path"
  }
} catch {}

Say "checking Node.js..."
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Fail "Node.js was not found." @(
    "Install Node.js 24 or newer: https://nodejs.org  (or: winget install OpenJS.NodeJS.LTS)",
    "Already installed? Close this window and open a new one so PATH is refreshed."
  )
}
$nodeVersion = (& node -p "process.versions.node" 2>$null | Select-Object -First 1)
$nodeMajor = 0
if ($nodeVersion -match '^(\d+)') { $nodeMajor = [int]$Matches[1] }
if ($nodeMajor -lt 24) {
  Fail "Node.js $nodeVersion is too old (24+ required)." @(
    "Download Node.js 24+: https://nodejs.org",
    "or with winget: winget install OpenJS.NodeJS.LTS"
  )
}
Ok "Node.js $nodeVersion"

# The agent runtime loads native add-ons that refuse to run under the Node that
# Electron ships, so the app needs a plain Node.js at startup.
if ((& node -p "process.versions.electron ? 'yes' : 'no'" 2>$null) -eq 'yes') {
  Fail "The 'node' on PATH is the runtime bundled with Electron." @(
    "The agent runtime's native modules cannot load under it.",
    "Install a plain Node.js 24+ (https://nodejs.org) and put it on PATH first."
  )
}
Ok "plain Node.js runtime (not Electron's)"

Say "checking pnpm..."
$pnpmShim = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpmShim) {
  Warn "pnpm not found - installing it for the current user (no admin rights needed)"

  # corepack is the official route; it needs to write into the Node.js install
  # directory, which fails without admin rights - that is expected here.
  $installed = $false
  $corepack = Get-Command corepack -ErrorAction SilentlyContinue
  if ($corepack) {
    & corepack enable pnpm 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0 -and (Get-Command pnpm -ErrorAction SilentlyContinue)) { $installed = $true }
  }

  # Fall back to npm's user-level prefix, which never needs admin rights.
  if (-not $installed) {
    Say "installing pnpm into the user npm prefix..."
    & npm i -g pnpm --registry=https://registry.npmmirror.com 2>&1 | Out-Null
    try {
      $npmPrefix = (& npm config get prefix 2>$null | Select-Object -First 1)
      if ($npmPrefix -and (Test-Path (Join-Path $npmPrefix 'pnpm.cmd'))) {
        $env:Path = "$npmPrefix;$env:Path"
        $installed = $true
      }
    } catch {}
  }

  if (-not $installed) {
    Fail "pnpm could not be installed automatically." @(
      "Run: npm i -g pnpm",
      "or install it from https://pnpm.io/installation and run setup again."
    )
  }
}
$pnpmVersion = (& pnpm -v 2>$null | Select-Object -First 1)
Ok "pnpm $pnpmVersion"

# pnpm refuses to replace node_modules when it cannot ask a question, which is
# exactly the case in a double-clicked window. CI=true makes that decision for it.
$env:CI = "true"

# ------------------------------------------------------------------- install --
Say "installing dependencies (pnpm install)..."
& pnpm install
if ($LASTEXITCODE -ne 0) {
  Fail "pnpm install failed." @(
    "If the network is the problem, retry; the registry mirror in .npmrc is already set to npmmirror.",
    "If it complains about a lockfile mismatch, run: pnpm install --no-frozen-lockfile"
  )
}
Ok "dependencies installed"

# --------------------------------------------------------------------- build --
Say "building the workspace (pnpm build)..."
& pnpm build
if ($LASTEXITCODE -ne 0) { Fail "pnpm build failed - read the compiler output above." }
Ok "workspace built"

# ------------------------------------------------------------------ electron --
Say "checking the Electron binary..."
$electronDir = Join-Path $RepoRoot "apps\desktop\node_modules\electron"
$electronExe = Join-Path $electronDir "dist\electron.exe"
if (-not (Test-Path $electronExe)) {
  if (-not (Test-Path (Join-Path $electronDir "install.js"))) {
    Fail "The electron package is not installed (apps\desktop\node_modules\electron is missing)." @(
      "Run: pnpm install"
    )
  }
  Say "downloading Electron (npmmirror mirror)..."
  Push-Location $electronDir
  $env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
  & node install.js
  $electronRc = $LASTEXITCODE
  Pop-Location
  if ($electronRc -ne 0 -or -not (Test-Path $electronExe)) {
    Fail "The Electron binary could not be downloaded." @(
      "Retry with a stable network, or download manually:",
      "  cd apps\desktop\node_modules\electron",
      "  `$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'; node install.js"
    )
  }
}
Ok "Electron binary present"

# ------------------------------------------------------- native addon: sqlite --
# better-sqlite3 ships a prebuilt module for Node's ABI, not Electron's. Without
# this step the app still runs - it falls back to the JSON store - but SQLite is
# the intended storage, so the addon is rebuilt for Electron's ABI here.
Say "preparing the SQLite native module for Electron..."
$sqlitePkg = Get-ChildItem (Join-Path $RepoRoot "node_modules\.pnpm") -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like "better-sqlite3@*" } | Select-Object -First 1
$electronVersion = (& node -p "require('$($electronDir -replace '\\','/')/package.json').version" 2>$null | Select-Object -First 1)

if ($sqlitePkg -and $electronVersion) {
  $sqliteRoot = Join-Path $sqlitePkg.FullName "node_modules\better-sqlite3"
  $binding = Join-Path $sqliteRoot "build\Release\better_sqlite3.node"

  # The only trustworthy test of "does this module work under Electron" is to
  # load it under Electron. Reading an ABI tag out of the binary does not work:
  # node-gyp has no reason to embed one, so a module that loads perfectly looks
  # identical to a stale one.
  function Test-SqliteBinding {
    if (-not (Test-Path $electronExe)) { return $false }
    $probeFile = Join-Path $env:TEMP ("loomnote-sqlite-probe-" + [guid]::NewGuid().ToString("N") + ".cjs")
    $modulePath = ($sqliteRoot -replace '\\', '/')
    @"
try {
  const Database = require('$modulePath');
  const db = new Database(':memory:');
  db.exec('create table probe(a)');
  db.exec('drop table probe');
  db.close();
  console.log('LOOMNOTE_SQLITE_OK');
} catch (e) {
  console.log('LOOMNOTE_SQLITE_FAIL ' + e.message);
}
"@ | Set-Content -Path $probeFile -Encoding UTF8

    $saved = $env:ELECTRON_RUN_AS_NODE
    $env:ELECTRON_RUN_AS_NODE = "1"
    $out = ""
    try {
      $out = & $electronExe $probeFile 2>$null | Out-String
    } catch {
      $out = ""
    } finally {
      if ($null -eq $saved) { Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue }
      else { $env:ELECTRON_RUN_AS_NODE = $saved }
      Remove-Item $probeFile -Force -ErrorAction SilentlyContinue
    }
    return ($out -match 'LOOMNOTE_SQLITE_OK')
  }

  if (Test-SqliteBinding) {
    Ok "SQLite module loads under Electron $electronVersion"
  } else {
    # The app must not be running: Windows keeps the .node file locked while
    # it is mapped, and node-gyp cannot replace a locked file (EPERM).
    $running = Get-Process electron -ErrorAction SilentlyContinue
    if ($running) {
      Say "closing the running LoomNote instance so the module can be replaced..."
      $running | Stop-Process -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 3
    }

    $gypBin = $null
    $npmModules = "C:\Program Files\nodejs\node_modules\npm\node_modules"
    $gypDir = Get-ChildItem $npmModules -Directory -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -eq "node-gyp" } | Select-Object -First 1
    if ($gypDir) { $gypBin = Join-Path $gypDir.FullName "bin\node-gyp.js" }

    if (-not $gypBin -or -not (Test-Path $gypBin)) {
      Warn "node-gyp was not found, so the SQLite module cannot be compiled."
      Warn "The app still runs - it keeps notes in a JSON store with the same features."
    } else {
      Say "compiling the SQLite module for Electron $electronVersion (one time, a few minutes)..."
      Push-Location $sqliteRoot
      $env:npm_config_runtime = "electron"
      $env:npm_config_target = $electronVersion
      $env:npm_config_disturl = "https://electronjs.org/headers"
      $env:npm_config_arch = "x64"
      $env:npm_config_build_from_source = "true"
      & node $gypBin rebuild --release 2>&1 | Out-Null
      Remove-Item Env:npm_config_runtime, Env:npm_config_target, Env:npm_config_disturl,
                    Env:npm_config_arch, Env:npm_config_build_from_source -ErrorAction SilentlyContinue
      Pop-Location

      # Verify by loading it, never by trusting an exit code.
      if (Test-SqliteBinding) {
        Ok "SQLite module compiled and verified under Electron $electronVersion"
      } else {
        Warn "The SQLite module could not be built (usually no C++ toolchain)."
        Warn "This does NOT block you: the app keeps notes in a JSON store, same features."
        Warn "For SQLite, install 'Desktop development with C++' from the Visual Studio"
        Warn "Build Tools, then run this setup again."
      }
    }
  }
} else {
  Warn "better-sqlite3 was not found in node_modules - the app will use the JSON store."
}

# ------------------------------------------------------------------- summary --
Write-Host ""
Write-Host "  Setup complete." -ForegroundColor Green
Write-Host "  Start the app: .\scripts\start.ps1" -ForegroundColor White
Write-Host "  First run: open Settings, enter your LLM endpoint and API key, then import" -ForegroundColor Gray
Write-Host "             a lecture into the Inbox." -ForegroundColor Gray
Write-Host ""

# A script started by double-clicking runs in a console that closes the moment
# it ends, taking the output with it. Keep it open when there is nobody to read
# the exit code - but never block a non-interactive run (CI, a piped shell).
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

Wait-IfDoubleClicked
exit 0
