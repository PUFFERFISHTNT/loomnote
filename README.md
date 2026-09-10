# 织记 LoomNote

AI 原生的智能笔记 + 复习 + 知识库一体化桌面应用（Windows + macOS 双端）。
把原始资料交给一个会自己上网查证、会演示、记得你的 **Harness Agent**，长出「学得会」的笔记。

## 终极文档系列（docs/final/）

| 文档 | 内容 |
|---|---|
| [00-项目总纲](docs/final/00-项目总纲.md) | 项目宪法：身份 / 边界 / Harness Agent 定义 / 原则 / ADR 决策记录 |
| [01-市场与竞品分析](docs/final/01-市场与竞品分析.md) | 全网同类产品调研、产品概念打分、机会矩阵、借鉴定 TOP10 |
| [02-产品定义与功能规划](docs/final/02-产品定义与功能规划.md) | 七大视图、功能对标、AI 增强维度、四条核心工作流的体验定义 |
| [03-技术架构与工程设计](docs/final/03-技术架构与工程设计.md) | 分层架构、Harness Agent 运行时、选型、数据模型、渲染与可靠性 |
| [04-记忆引擎与智能进化](docs/final/04-记忆引擎与智能进化.md) | VCP 源码调研结论、分层记忆、三通道召回、自进化闭环 |
| [05-开发执行计划](docs/final/05-开发执行计划.md) | 里程碑 M0–M4、11 条验收标准、风险登记、待确认事项 |
| [06-专家评审与优化决议](docs/final/06-专家评审与优化决议.md) | 三路子 Agent 评审打分、讨论结论、终局决策 Delta |
| [07-安全基线](docs/final/07-安全基线.md) | Electron 三支柱、演示沙箱三件套、密钥/IPC/CI 安全门禁 |

过程稿与评审档案归档在 [docs/drafts/](docs/drafts/)；实测踩坑见 [WORKFLOW_LESSONS.md](WORKFLOW_LESSONS.md)。

## 代码结构（pnpm workspace）

```
packages/core/     IR 解析 · 演示纪律校验器 · 查询特征预分析（零依赖）
packages/memory/   记忆引擎：chunker/dedup/embedder/store/recall/fold/packager/rules/engine
packages/agent/    Harness：SSE 解析 · Provider(OpenAI 兼容) · 双协议 · 工具注册表 · agent loop
apps/desktop/      Electron + React：主进程(窗口/单实例/SQLite+JSON兜底/安全/IPC) · preload · 渲染层三栏三模式 + 演示沙箱
```

## 开发（开发测试版，双端）

```bash
pnpm install
pnpm test          # 52 个单测/冒烟（core+memory+agent+desktop）
pnpm typecheck     # 四包 TS strict 全绿
pnpm build         # electron-vite 构建（主/预加载/渲染产物）
pnpm dev           # 启动桌面应用（需 Electron 二进制 + 可选 better-sqlite3 原生）
```

当前状态：**M0–M2 核心链路已实现并测试通过**（52/52 绿、四包 typecheck 通过、构建产物齐全）。在应用「设置」填入任一 OpenAI 兼容端点即可让 agent 联网整理/生成演示（演示在 CSP 沙箱内渲染、外联=0 校验）。