import { useSyncExternalStore } from 'react'

export type Lang = 'zh' | 'en'

const STORAGE_KEY = 'loomnote.lang'
let current: Lang = 'zh'
const listeners = new Set<() => void>()

/**
 * UI strings. Each entry is [中文, English].
 * Keep keys grouped by area so the dictionary stays easy to audit.
 */
export const DICT = {
  // ---- shell -------------------------------------------------------------
  'app.name': ['织记', 'LoomNote'],
  'app.tagline': ['LoomNote', 'living notes'],
  'nav.workbench': ['工作台', 'Workbench'],
  'nav.inbox': ['资料箱', 'Inbox'],
  'nav.notes': ['笔记工作区', 'Notes'],
  'nav.review': ['复习中心', 'Review'],
  'nav.graph': ['知识图谱', 'Graph'],
  'nav.settings': ['设置', 'Settings'],
  'nav.agent': ['Agent 运行时', 'Agent runtime'],
  'storage.local': ['本地 JSON', 'Local JSON'],
  'storage.notes': ['{n} 篇笔记', '{n} notes'],
  'storage.note.one': ['{n} 篇笔记', '{n} note'],
  'common.loading': ['加载中…', 'Loading…'],

  // ---- workbench ---------------------------------------------------------
  'dash.greet.night': ['夜深了', 'Working late'],
  'dash.greet.morning': ['早上好', 'Good morning'],
  'dash.greet.afternoon': ['下午好', 'Good afternoon'],
  'dash.greet.evening': ['晚上好', 'Good evening'],
  'dash.welcome': ['，欢迎回来', ', welcome back'],
  'dash.model': ['接口', 'Model'],
  'dash.stat.notes': ['笔记', 'Notes'],
  'dash.stat.imports': ['导入资料', 'Imports'],
  'dash.stat.storage': ['本地存储 · {state}', 'Local storage · {state}'],
  'dash.stat.healthy': ['健康', 'healthy'],
  'dash.stat.events': ['Agent 事件（本次会话）', 'Agent events (this session)'],
  'dash.action.import': ['导入资料', 'Import material'],
  'dash.action.organise': ['去整理笔记', 'Organise notes'],
  'dash.recent': ['最近笔记', 'Recent notes'],
  'dash.updated': ['更新', 'updated'],
  'dash.open': ['打开', 'Open'],
  'dash.empty.title': ['还没有任何笔记', 'No notes yet'],
  'dash.empty.body': [
    '把一份讲义 PDF 或 Markdown 拖进「资料箱」，织记的 agent 会把它整理成带公式、演示和自测题的学习笔记。',
    'Drop a lecture PDF or a Markdown file into the Inbox; the agent turns it into a study note with formulas, demos and self-test questions.'
  ],

  // ---- inbox -------------------------------------------------------------
  'inbox.title': ['资料箱', 'Inbox'],
  'inbox.sub': [
    '拖入或选择文件，解析后自动生成笔记（PDF 提取正文文本；公式与插图随 AI 整理进入笔记）。',
    'Drop in or choose a file; it is parsed on this machine and a note is created (PDF text is extracted locally; formulas and figures come in with the note).'
  ],
  'inbox.drop.parsing': ['正在解析导入…', 'Parsing…'],
  'inbox.drop.release': ['松手即导入', 'Drop to import'],
  'inbox.drop.idle': ['把文件拖到这里', 'Drop a file here'],
  'inbox.drop.hint': ['支持 PDF · Markdown · TXT ｜ 或', 'PDF · Markdown · TXT ｜ or'],
  'inbox.choose': ['选择文件…', 'Choose a file…'],
  'inbox.history': ['导入记录', 'Import history'],
  'inbox.none': ['暂无导入记录', 'No imports yet'],
  'inbox.none.hint': [
    'Word / Excel 解析在后续版本加入；当前 PDF 与 Markdown 已全链路可用。',
    'Word and Excel parsing come later; PDF and Markdown already work end to end.'
  ],
  'inbox.col.file': ['文件', 'File'],
  'inbox.col.type': ['类型', 'Type'],
  'inbox.col.status': ['状态', 'Status'],
  'inbox.col.time': ['时间', 'When'],
  'inbox.status.done': ['✓ 已完成', '✓ Done'],

  // ---- notes -------------------------------------------------------------
  'notes.all': ['全部笔记', 'All notes'],
  'notes.breadcrumb': ['笔记', 'Note'],
  'notes.empty': ['还没有笔记', 'No notes yet'],
  'notes.empty.action': ['去资料箱导入一份', 'Import one from the Inbox'],
  'notes.saved': ['已保存', 'Saved'],
  'notes.unsaved': ['未保存', 'Unsaved'],
  'notes.tab.read': ['正文', 'Read'],
  'notes.tab.demo': ['演示', 'Demo'],
  'notes.tab.source': ['源码', 'Source'],
  'notes.ai.demo': ['AI 生成演示', 'AI demo'],
  'notes.ai.organise': ['AI 整理', 'AI organise'],
  'notes.generating': ['正在生成 · 实时预览（可在右侧面板随时提需求或停止）', 'Writing… live preview — interrupt from the panel on the right at any time'],
  'notes.revert': ['撤销修改', 'Revert'],
  'notes.save': ['保存', 'Save'],
  'notes.embedded.demo': ['内嵌演示', 'Embedded demo'],
  'notes.demo.generating': ['正在生成交互演示…', 'Writing an interactive demo…'],
  'notes.demo.none': ['这篇笔记还没有演示', 'This note has no demo yet'],
  'notes.demo.hint': [
    '点上方「AI 生成演示」，agent 会为知识点生成分步动画 HTML，在安全沙箱内渲染（外联 = 0，数据不出本机）。',
    'Press “AI demo” above: the agent writes a step-by-step HTML animation for the concept and renders it in a safe sandbox — no external requests, nothing leaves this machine.'
  ],
  'notes.placeholder.title': ['选择左侧一篇笔记开始', 'Choose a note on the left'],
  'notes.placeholder.body': ['或到「资料箱」导入 Markdown，让 agent 把它整理成学习笔记。', 'or import a file from the Inbox and let the agent organise it into a study note.'],
  'notes.confirm.reorganise': ['将重新整理《{title}》并覆盖正文内容，继续？', 'Re-organising “{title}” will replace the current note body. Continue?'],
  'notes.untitled': ['未命名笔记', 'Untitled note'],
  'notes.prompt.organise': [
    '请整理以下笔记为结构化学习笔记（主标题/:::toc 目录/章节/速记卡/自测题），并保留原文关键信息：\n\n{body}',
    'Organise the following material into a structured study note (main title / :::toc table of contents / sections / quick-recall cards / self-test questions) and keep the key information:\n\n{body}\n\nWrite the note in English.'
  ],
  'notes.prompt.demo': [
    '为一个学习知识点生成一个自包含的 HTML 交互演示（可点击分步、纯内联样式与脚本、不引用任何外部资源、单根容器 div）。\n\n背景：{body}',
    'Create one self-contained interactive HTML demo for a study concept (click-through steps, fully inline styles and scripts, no external resources, single root container div).\n\nContext: {body}\n\nWrite all labels in English.'
  ],

  // ---- agent panel -------------------------------------------------------
  'agent.title': ['Agent 运行时', 'Agent runtime'],
  'agent.stop': ['停止', 'Stop'],
  'agent.collapse': ['收起面板', 'Collapse'],
  'agent.running': ['运行中', 'Running'],
  'agent.idle': ['空闲', 'Idle'],
  'agent.tools': ['工具', 'Tools'],
  'agent.interrupted': ['已中断', 'Interrupted'],
  'agent.done': ['完成', 'Done'],
  'agent.task': ['任务', 'Task'],
  'agent.placeholder.note': ['对《{title}》提需求，如「给排队问题加个动画演示」…', 'Ask for a change to “{title}” — e.g. “animate the queueing problem”…'],
  'agent.placeholder.none': ['打开一篇笔记后即可对 agent 提需求…', 'Open a note to start asking the agent for changes…'],
  'agent.send': ['发送', 'Send'],
  'agent.live': ['实时输出', 'Live output'],
  'agent.empty.title': ['还没有运行', 'Nothing running yet'],
  'agent.empty.body': [
    '在笔记工作区点「AI 整理」或「AI 生成演示」——它的每一步思考、每次工具调用和流式输出都会实时出现在这里。',
    'Press “AI organise” or “AI demo” in the notes workspace — every thought, tool call and streamed token shows up here as it happens.'
  ],
  'agent.step.tool': ['调用工具', 'Tool call'],
  'agent.step.args': ['参数', 'Arguments'],
  'agent.step.result': ['完整结果', 'Full result'],
  'agent.step.checkpoint': ['检查点', 'Checkpoint'],
  'agent.prompt.context': ['当前笔记《{title}》内容：\n{body}', 'Current note “{title}”:\n{body}'],
  'agent.prompt.noNote': ['（尚未打开笔记）', '(no note open)'],
  'agent.prompt.task': ['用户需求：{task}\n\n请输出更新后的完整 Markdown 笔记。要求：', 'User request: {task}\n\nReturn the complete updated Markdown note. Requirements:'],
  'agent.prompt.demoRule': [
    '在概念适合可视化或用户着重要求的位置，插入演示块（格式：单独一行 :::demo 演示标题，接着完整自包含 HTML（内联样式与脚本、不引用外部资源、单根 div），最后单独一行 ::: 收束）。',
    'Where a concept benefits from being shown moving, or where the user asked for it, insert a demo block (one line :::demo <title>, then a fully self-contained HTML block with inline styles and scripts and a single root div, then a closing ::: line).'
  ],
  'agent.prompt.markdownRule': ['其余内容用正常 Markdown（公式用 $ 或 $$）。直接输出最终结果。', 'Everything else uses normal Markdown ($ for inline formulas). Output the final result directly.'],
  'agent.prompt.englishRule': ['整篇笔记用英文撰写。', 'Write the whole note in English.'],

  // ---- demo sandbox ------------------------------------------------------
  'demo.interactive': ['交互演示', 'Interactive demo'],
  'demo.sandboxed': ['沙箱渲染', 'Sandbox rendered'],
  'demo.external': ['外联', 'External requests'],
  'demo.bridge': ['桥接事件：', 'Bridge events: '],
  'demo.blocked': ['演示片段未通过纪律校验，已拦截（不会渲染）', 'Demo blocked: it failed the discipline check, so it was not rendered.'],

  // ---- settings ----------------------------------------------------------
  'settings.title': ['设置', 'Settings'],
  'settings.sub': [
    '模型接口自由接入：已内置 DeepSeek 官方 API（deepseek-v4.1-flash），也可添加任意 OpenAI 兼容端点。密钥只存本机。',
    'Any model endpoint: the DeepSeek official API is configured out of the box, and you can add any OpenAI-compatible address. Keys stay on this machine.'
  ],
  'settings.language': ['界面语言', 'Language'],
  'settings.language.hint': ['界面与 AI 生成笔记的语言', 'Language of the interface and of generated notes'],
  'settings.list': ['接口列表（点选左侧圆圈设为当前使用）', 'Endpoints — select the circle to make one active'],
  'settings.makeActive': ['设为当前接口', 'Make active'],
  'settings.inUse': ['当前使用', 'In use'],
  'settings.remove': ['删除此接口', 'Remove'],
  'settings.model': ['模型名', 'Model'],
  'settings.maxTokens': ['最大输出 tokens', 'Max output tokens'],
  'settings.addCustom': ['添加自定义接口', 'Add a custom endpoint'],
  'settings.orPreset': ['或从预设补回：', 'or restore a preset:'],
  'settings.add': ['添加', 'Add'],
  'settings.agentTools': ['Agent 工具', 'Agent tools'],
  'settings.web': ['允许联网（web_fetch 抓取网页查证）', 'Allow web access (web_fetch, for checking sources)'],
  'settings.save': ['保存设置', 'Save settings'],
  'settings.saved': ['已保存', 'Saved'],
  'settings.custom': ['自定义接口', 'Custom endpoint'],
  'settings.hint': [
    '提示：DeepSeek 官方 API 默认使用 deepseek-v4.1-flash（长上下文），最大输出 tokens 设为 1000000，长笔记不会被截断；需要更强推理可改为 deepseek-reasoner。',
    'Tip: the DeepSeek official API defaults to deepseek-v4.1-flash (long context) with max output tokens set to 1,000,000 so long notes are not cut off; switch to deepseek-reasoner for harder reasoning.'
  ],

  // ---- provider presets (matched by preset id) ---------------------------
  'preset.deepseek-official': ['DeepSeek 官方 API', 'DeepSeek official API'],
  'preset.volc-ark-coding': ['火山方舟 Coding Plan', 'Volcengine Ark Coding Plan'],
  'preset.volc-ark-glm': ['火山方舟 · GLM 5.3 Flash（视觉）', 'Volcengine Ark · GLM 5.3 Flash (vision)'],
  'preset.ollama-local': ['本地 Ollama', 'Ollama (local)'],

  // ---- misc --------------------------------------------------------------
  'comingSoon.review.title': ['复习中心', 'Review centre'],
  'comingSoon.review.desc': [
    '抽认卡、FSRS 间隔重复与错题归因将在 M4 上线。AI 整理出的自测题此刻已随笔记生成。',
    'Flashcards, spaced repetition and mistake tracking arrive in M4. The self-test questions are already written with each note.'
  ],
  'comingSoon.graph.title': ['知识图谱', 'Knowledge graph'],
  'comingSoon.graph.desc': [
    '力导向画布、增量合并 Diff 与 MOC 地图将在 M3 上线。双链语法 [[知识点]] 已可在笔记中使用。',
    'The graph canvas, incremental merging and MOC maps arrive in M3. Wiki-link syntax already works inside notes.'
  ],
  'comingSoon.title': ['即将上线', 'Coming soon'],
  'comingSoon.body': ['该视图按里程碑排期开发中。', 'This view is scheduled for a later milestone.'],
  'time.today': ['今天', 'Today'],
  'time.yesterday': ['昨天', 'Yesterday']
} as const

export type Key = keyof typeof DICT

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getLang(): Lang {
  return current
}

export function locale(): string {
  return current === 'zh' ? 'zh-CN' : 'en-GB'
}

export function setLang(lang: Lang): void {
  if (lang !== 'zh' && lang !== 'en') return
  current = lang
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* private mode: keep the in-memory value */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
  listeners.forEach((fn) => fn())
}

/** Called once at startup: stored preference first, then the value that came from settings. */
export function initLang(fallback: Lang): Lang {
  let initial: Lang | null = null
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'zh' || saved === 'en') initial = saved
  } catch {
    initial = null
  }
  current = initial ?? fallback
  try {
    localStorage.setItem(STORAGE_KEY, current)
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = current === 'zh' ? 'zh-CN' : 'en'
  return current
}

/** Re-render a component when the language changes. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang)
}

export function t(key: Key, vars?: Record<string, string | number>): string {
  const entry: readonly [string, string] | undefined = DICT[key]
  if (!entry) return String(key)
  let s: string = entry[current === 'zh' ? 0 : 1]
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
  }
  return s
}

/** Preset providers are shown in the current language; user-made ones keep their own name. */
export function providerLabel(p: { id: string; name: string }): string {
  const key = `preset.${p.id}` as Key
  return key in DICT ? t(key) : p.name
}
