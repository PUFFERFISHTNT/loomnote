# 织记 LoomNote 一键启动（Windows PowerShell）
# 用法：.\scripts\start.ps1
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

# 1. 加载本地配置（API Key 等）
if (Test-Path "config/local.env") {
  Get-Content "config/local.env" | ForEach-Object {
    if ($_ -match "^\s*([^#][^=]+)=(.*)$") {
      [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
    }
  }
}

# 2. 解除宿主环境干扰
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

$main = "apps/desktop/out/main/index.js"
if (-not (Test-Path $main)) {
  Write-Host "▶ 首次运行：构建中…"
  Push-Location apps/desktop
  .\node_modules\.bin\electron-vite build
  Pop-Location
}

# 3. 定位 Electron 二进制
$bin = "apps/desktop/node_modules/electron/dist/electron.exe"
if (-not (Test-Path $bin)) { $bin = "apps/desktop/node_modules/electron/dist/Electron.exe" }
if (-not (Test-Path $bin)) {
  Write-Host "✗ Electron 二进制缺失，请先执行：cd apps\desktop\node_modules\electron; $env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'; node install.js"
  exit 1
}

# 4. 启动
& $bin $main @args
exit $LASTEXITCODE