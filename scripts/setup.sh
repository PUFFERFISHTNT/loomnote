#!/usr/bin/env bash
# 织记 LoomNote · 一键开发环境安装（macOS / Linux）
# 用法：./scripts/setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf "\033[1;36m▶ %s\033[0m\n" "$*"; }

# 1. 环境检查
if ! command -v node >/dev/null 2>&1; then echo "✗ 未找到 Node.js，请先安装 Node 24+（https://nodejs.org）"; exit 1; fi
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 24 ]; then echo "✗ Node 版本过低（当前 $NODE_MAJOR），需要 24+"; exit 1; fi
if ! command -v pnpm >/dev/null 2>&1; then echo "✗ 未找到 pnpm，请先安装（npm i -g pnpm 或 https://pnpm.io）"; exit 1; fi

# 2. 安装依赖（国内镜像已在 .npmrc 配置）
say "安装依赖（pnpm install）…"
pnpm install

# 3. 运行测试
say "运行测试（pnpm test）…"
pnpm test

# 4. 构建
say "构建（pnpm build）…"
pnpm build

# 5. Electron 二进制检查（首次需要下载）
ELECTRON_DIR="apps/desktop/node_modules/electron"
if [ ! -d "$ELECTRON_DIR/dist/Electron.app" ] && [ ! -f "$ELECTRON_DIR/dist/electron" ]; then
  say "下载 Electron 二进制（npmmirror 镜像）…"
  (cd "$ELECTRON_DIR" && ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" node install.js)
fi

say "安装完成 ✅ 启动应用：./scripts/start.sh（或直接双击 start.command）"
say "首次使用：打开「设置」→ 选择/填写 LLM 接口与 API Key → 保存 → 去「资料箱」导入讲义。"
