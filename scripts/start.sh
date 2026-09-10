#!/usr/bin/env bash
# 织记 LoomNote 一键启动（macOS / Linux）
# 用法：./scripts/start.sh   （可加 --smoke 自检）
set -euo pipefail
cd "$(dirname "$0")/.."

# 1. 加载本地配置（API Key 等）
if [ -f config/local.env ]; then
  set -a
  # shellcheck disable=SC1091
  source config/local.env
  set +a
fi

# 2. 解除 DSH 等宿主环境对 Electron 的干扰
unset ELECTRON_RUN_AS_NODE 2>/dev/null || true

# 3. 定位 Electron 二进制（按平台）
if [ "$(uname)" = "Darwin" ]; then
  BIN="apps/desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
else
  BIN="apps/desktop/node_modules/electron/dist/electron"
fi
MAIN="apps/desktop/out/main/index.js"

# 4. 首次运行自动构建
if [ ! -f "$MAIN" ]; then
  echo "▶ 首次运行：构建中…"
  (cd apps/desktop && ./node_modules/.bin/electron-vite build)
fi

# 5. 启动
if [ ! -x "$BIN" ]; then
  echo "✗ Electron 二进制缺失，请先执行：cd apps/desktop/node_modules/electron && ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node install.js"
  exit 1
fi
exec "$BIN" "$MAIN" "$@"