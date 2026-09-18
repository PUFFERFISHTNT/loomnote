# 织记 LoomNote · 一键开发环境安装（Windows PowerShell）
# 用法：.\scripts\setup.ps1
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

function Say($m) { Write-Host "▶ $m" -ForegroundColor Cyan }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host "✗ 未找到 Node.js，请先安装 Node 24+（https://nodejs.org）"; exit 1 }
$nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 24) { Write-Host "✗ Node 版本过低（$nodeMajor），需要 24+"; exit 1 }
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { Write-Host "✗ 未找到 pnpm，请先安装（npm i -g pnpm）"; exit 1 }

Say "安装依赖（pnpm install）…"
pnpm install

Say "运行测试（pnpm test）…"
pnpm test

Say "构建（pnpm build）…"
pnpm build

$electronDist = "apps/desktop/node_modules/electron/dist"
if (-not (Test-Path (Join-Path $electronDist "electron.exe"))) {
  Say "下载 Electron 二进制（npmmirror 镜像）…"
  Push-Location "apps/desktop/node_modules/electron"
  $env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
  node install.js
  Pop-Location
}

Say "安装完成 ✅ 启动应用：.\scripts\start.ps1"
Say "首次使用：打开「设置」→ 选择/填写 LLM 接口与 API Key → 保存 → 去「资料箱」导入讲义。"
