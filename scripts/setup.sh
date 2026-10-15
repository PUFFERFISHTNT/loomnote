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
# The agent runtime loads native add-ons that refuse to run under the Node
# Electron ships, so a plain Node has to exist. The app looks for one itself at
# startup; this only warns early, with the fix.
if [ "$(node -p "process.versions.electron ? 'yes' : 'no'")" = "yes" ]; then
  echo "✗ 当前 node 是 Electron 自带的运行时；Agent 运行时的原生模块无法在它下面加载。"
  echo "  请安装普通 Node 24+（https://nodejs.org），或用 LOOMNOTE_NODE 指向一个。"
  exit 1
fi
if ! command -v pnpm >/dev/null 2>&1; then echo "✗ 未找到 pnpm，请先安装（npm i -g pnpm 或 https://pnpm.io）"; exit 1; fi

# 2. 安装依赖（国内镜像已在 .npmrc 配置）
say "安装依赖（pnpm install）…"
pnpm install

# 3. 构建
say "构建（pnpm build）…"
pnpm build

# 4. Electron 二进制检查（首次需要下载）
ELECTRON_DIR="apps/desktop/node_modules/electron"
if [ ! -d "$ELECTRON_DIR/dist/Electron.app" ] && [ ! -f "$ELECTRON_DIR/dist/electron" ]; then
  say "下载 Electron 二进制（npmmirror 镜像）…"
  (cd "$ELECTRON_DIR" && ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" node install.js)
fi

# 5. SQLite 原生模块（可选）。构建成功就用 SQLite，失败则自动退回 JSON 存储，
#    应用照常运行，所以这里只提示、不中断。
say "尝试为 Electron 重建 better-sqlite3（失败不影响使用，会自动退回 JSON 存储）…"
(cd apps/desktop && ./node_modules/.bin/electron-rebuild -f -w better-sqlite3 >/dev/null 2>&1) \
  && say "SQLite 原生模块就绪 ✅" \
  || say "跳过 SQLite 重建（应用将使用 JSON 存储，功能一致）"

say "安装完成 ✅ 启动应用：./scripts/start.sh（或直接双击 start.command）"
say "笔记由 DeepSeek Harness 运行时驱动，启动时需要本机有一个普通 Node.js 24+（不是 Electron 自带的那个）。"
say "首次使用：打开「设置」→ 选择/填写 LLM 接口与 API Key → 保存 → 去「资料箱」导入讲义。"
