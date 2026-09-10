# WORKFLOW_LESSONS.md（踩坑日志）

> 本文件存放织记开发测试版（M0–M2）实测经验，避免新会话重复踩坑。公共仓库卫生：不写本机私有路径/端口/用户名。

## 2026-09-10 · M0–M2 开发测试版首轮构建

### 环境与工具链
- **DSH 宿主 shell 无 `npm`/`npx`**：用 `pnpm`（10.34.5）+ `node_modules/.bin/*` 直调；electron-vite 等包级 bin 只在对应包目录的 `node_modules/.bin`，需 `cd apps/desktop && ./node_modules/.bin/electron-vite build`。
- **pnpm 10 默认拦截依赖 build scripts**：better-sqlite3 / esbuild 被忽略。需在根 `package.json` 配置 `"pnpm": { "onlyBuiltDependencies": [...] }` 后再 `pnpm rebuild`。
- **better-sqlite3 原生绑定**：本机（Node 24.18 / macOS arm64）无 prebuild、node-gyp 不可用 → `require` 失败。**应用已内置 JSON 兜底**（`db.ts` 的 `JsonAppDb`），`pnpm dev` 无碍；要在本机启用 SQLite：挂代理后 `pnpm rebuild better-sqlite3`（prebuild 下载自 GitHub），或安装 Xcode CLT 编译。Windows 同理需 VS Build Tools。
- **Electron 二进制**：安装时用 `ELECTRON_SKIP_BINARY_DOWNLOAD=1` 跳过（CI/typecheck/build 不需要）；真正 `pnpm dev` 前需下载二进制（.npmrc 已配 npmmirror 镜像）。

### 类型与构建
- `verbatimModuleSyntax`：类型必须 `import type`；跨包类型（如 `AgentEvent`）需在中间层显式 re-export，否则 preload 侧 `import type { AgentEvent } from '../shared/ipc.js'` 报「declares locally but not exported」。
- `AppDb['health']` 这类「索引访问方法类型」不能直接当返回类型（会变成返回函数）——用显式对象返回类型。
- markdown-it 规则回调参数在 @types 下为隐式 any：显式标 `any` 即可；`md.utils` 在构造器类型上不可用，自备 `escapeHtml`。
- KaTeX `auto-render.mjs` 无类型：自建 `shims.d.ts` ambient 声明。
- `[[双链|别名]]` 显示文本应为别名——wikilink 规则内取 `label || target`。

### 渲染与沙箱
- mermaid/katex 会拉大渲染包（mermaid core 1.2MB + 各图 chunk）——桌面可接受，后续可按需裁剪 diagram 子集。
- 演示沙箱三件套已验证：`srcdoc + meta CSP(default-src 'none') + sandbox="allow-scripts allow-forms"`（永不加 allow-same-origin）+ MessageChannel 桥；`checkDemo` 外联=0 预检拦截 `https://` 资源。

### 待办（后续里程碑）
- SQLite 记忆持久化（SqliteMemoryStore，现为 InMemoryStore，重启即失）。
- PDF/图片解析真实管线（现 md/txt 直读；PDF 解析在 M1 深化）。
- zod IPC 校验替换手写 guard（07 §5 目标态）。
## 2026-09-10 · 真机冒烟（M0–M2 自检）
- **DSH 宿主 shell 注入 `ELECTRON_RUN_AS_NODE=1`**：会让 Electron 以纯 Node 运行、`require('electron')` 返回路径字符串。本机冒烟必须 `env -u ELECTRON_RUN_AS_NODE <Electron二进制> <main>` 直连二进制（cli.js 分派也受影响）；用户正常终端 `pnpm dev` 无此问题。
- **sandbox preload 必须 CJS**：electron-vite 在 `"type":"module"` 下会把 preload 打成 `.mjs`，sandbox 渲染进程加载失败。解法：desktop 包去掉 `type:module`，main/preload 全 CJS（main 内 `createRequire(__filename)` 而非 `import.meta.url`）。
- **Electron 二进制安装**：`node node_modules/electron/install.js` 需显式 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`（.npmrc 的 mirror 配置在直接跑 install.js 时不生效，会去 GitHub 超时）。
- 冒烟模式：`electron out/main/index.js --smoke` → did-finish-load 后打印 health JSON 并退出 0（CI 可复用）。

## 2026-09-10 · 方舟 Coding Plan 接入织记（实测）
- 端点 `https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions`（勿用 /api/v3 按量计费）。
- **deepseek-v4-flash**：普通 max_tokens 即可，回复正常。
- **glm-5.3-flash**：思考型模型，**max_tokens 必须 ≥512（实测 20 会返回空 content，1024 正常）**——织记 Provider 默认 4096，设置页可调。
- 凭证来源：DSH `~/.credentials.yaml` 的 `FANGZHOU_API_KEY`（46 位 ark- 开头）；写入 `config/local.env`（gitignored）与 userData `loomnote.json`。
- 一键启动：`./scripts/start.sh`（mac/Linux）、`.\scripts\start.ps1`（Windows）、`start.command`（macOS 双击）；脚本自动加载 config/local.env、解除 ELECTRON_RUN_AS_NODE、缺构建自动 electron-vite build。

## 2026-09-10 · PDF 导入空白事故复盘（用户实测发现）
- **事故**：文件对话框允许选 PDF，但导入只实现了 md/txt——PDF 被 `readFileSync(utf-8)` 读成 26 万字符乱码（可打印率 41%），渲染层空白。
- **根因教训**：纯逻辑层测试（52 项）覆盖不了 UI 导入流；**凡「对话框允许的类型」必须与「解析器支持的类型」严格一致**，不支持的类型要显式报错而非静默入库。
- **修复**：`src/main/parse.ts` 用 pdfjs-dist v6 legacy 按页 `getTextContent` 提取文本；`addImportMd` 按扩展名分派；docx 等明确抛「暂不支持」；清理 userData 乱码笔记（可打印率 <0.5 即删）。
- **pdfjs v6 坑**：`destroy()` 在 loadingTask 上（`getDocument(...)` 返回的 task），不在 `doc` 上；Node 环境 legacy 构建直接可用无需 canvas。
- **userData 设置种子格式**：应用读 `settings` 键下整块 JSON（`setSetting('settings', JSON.stringify(...))`），手动种字段级键值不会被读取。
- **单实例锁**：`requestSingleInstanceLock` 生效时，后启进程静默退出（exit 0 无日志）——冒烟前先确认无旧实例在跑（ps 查 Electron.app）。

## 2026-09-10 · 终稿冲刺：PDF 根因 / 混合渲染 / 实时预览（modlens 审图闭环）
- **PDF 导入挂死真根因**：`external: ['pdfjs-dist']` 字符串只精确匹配包名，不匹配 `pdfjs-dist/legacy/build/pdf.mjs` 子路径 → rollup 把 ESM 打进 CJS 分块转 `require("./pdf-xxx.js")` → 运行时挂死。修复：运行时 `require.resolve` 定位文件 + **变量 file-URL 动态导入**（rollup 无法静态分析，保留原生 `import()`）；--pdftest 看门狗 30s 防诊断挂死。构建产物实测 COMP2119 讲义 8916 字符 ✓。
- **演示沙箱空白三连环**：① srcdoc 继承父页 CSP 取交集 → 换 `data: URL`（data: 文档不继承父 CSP）② 仍空白 → 父页 CSP 缺 `frame-src data: blob:`（default-src 'self' 拦截 data: iframe）→ index.html CSP 补 frame-src ✓ ③ modlens 曾把 `:::toc` 空占位误判为演示卡——:::toc 现已实现自动目录（hydrate 阶段按 h2/h3 生成跳转列表）。
- **截图审图闭环**：`--screenshot=<route>:<out.png>` + LOOMNOTE_DATA_DIR 隔离种子数据 + executeJavaScript DOM 探针（slots/sandboxes/iframeH/reactErr）+ scrollIntoView 定位演示块 + modlens 视觉审核。最终四视图全过，M/M/1 排队动画（服务台/队列/按钮）完整渲染。
- **md+html 混合渲染**：`:::demo 标题\n<HTML>\n:::` 多行块由 markdown-it 块规则提取（demoSink），占位 div 经 createRoot 挂载内嵌 DemoSandbox（compact 420px）；agent 系统提示词要求自主在适合可视化处插演示块。
- **实时预览**：agent delta 聚合（store streamText，防事件洪泛）→ Notes 视图防抖 250ms 渲染实时 markdown（live-preview 置顶浮层）。
- 公式 OCR 里 `\;`/`\,` 空格命令会被视觉模型读成标点——非渲染 bug。
