import { useSyncExternalStore } from 'react'

export type Lang = 'zh' | 'en'

const STORAGE_KEY = 'loomnote.lang'
/** English is the default; a stored or configured preference overrides it at boot. */
let current: Lang = 'en'
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
  'nav.agent': ['AI 助手', 'Agent'],
  'nav.collapse': ['收起侧栏', 'Collapse sidebar'],
  'nav.expand': ['展开侧栏', 'Expand sidebar'],
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
  'notes.list.collapse': ['收起笔记列表', 'Collapse the note list'],
  'notes.list.expand': ['展开笔记列表', 'Expand the note list'],
  'notes.breadcrumb': ['笔记', 'Note'],
  'notes.empty': ['还没有笔记', 'No notes yet'],
  'notes.empty.action': ['去资料箱导入一份', 'Import one from the Inbox'],
  'notes.saved': ['已保存', 'Saved'],
  'notes.unsaved': ['未保存', 'Unsaved'],
  'notes.tab.read': ['正文', 'Read'],
  'notes.tab.slides': ['原稿', 'Slides'],
  'notes.tab.split': ['原稿+笔记', 'Slides+note'],
  'notes.tab.demo': ['演示', 'Demo'],
  'notes.tab.source': ['源码', 'Source'],
  'notes.slides.preparing': ['正在把讲义转成图片，AI 稍后就能自己看图（{done}/{total}）', 'Preparing slide images so the agent can see them ({done}/{total})'],
  'slides.error': ['无法显示这份讲义', 'This deck could not be displayed'],
  'slides.agentCanSee': ['AI 可以逐页查看这些原稿', 'The agent can look at any of these pages'],
  'notes.agent.open': ['问 AI', 'Ask the agent'],
  'notes.agent.running': ['AI 正在写…', 'Agent is writing…'],
  'notes.generating': ['正在写入文件…', 'Writing to the file…'],
  'notes.revert': ['撤销修改', 'Revert'],
  'notes.save': ['保存', 'Save'],
  'notes.embedded.demo': ['内嵌演示', 'Embedded demo'],
  'notes.toc': ['目录', 'Contents'],
  'notes.demo.generating': ['正在生成交互演示…', 'Writing an interactive demo…'],
  'notes.demo.none': ['这篇笔记还没有演示', 'This note has no demo yet'],
  'notes.demo.hint': [
    '在右侧对 AI 说「给这个知识点做个演示」，它会生成自包含的交互 HTML，并在安全沙箱内渲染（外联 = 0，数据不出本机）。',
    'Ask the agent — “add a demo for this concept” — and it writes a self-contained interactive HTML block that renders in a locked-down sandbox: no external requests, nothing leaves this machine.'
  ],
  'notes.placeholder.title': ['选择左侧一篇笔记开始', 'Choose a note on the left'],
  'notes.placeholder.body': ['或到「资料箱」导入 Markdown，让 agent 把它整理成学习笔记。', 'or import a file from the Inbox and let the agent organise it into a study note.'],
  'notes.untitled': ['未命名笔记', 'Untitled note'],

  // ---- agent panel (chat) ------------------------------------------------
  'chat.title': ['AI 助手', 'Agent'],
  'chat.stop': ['停止', 'Stop'],
  'chat.collapse': ['收起面板', 'Collapse'],
  'chat.status.starting': ['启动中', 'Starting'],
  'chat.status.ready': ['就绪', 'Ready'],
  'chat.status.running': ['工作中', 'Working'],
  'chat.status.idle': ['空闲', 'Idle'],
  'chat.status.stopped': ['未启动', 'Not started'],
  'chat.status.error': ['出错', 'Error'],
  'chat.working': ['正在处理…', 'Working…'],
  'chat.thinking': ['思考过程', 'Thinking'],
  'chat.thinking.chars': ['{n} 字', '{n} chars'],
  'chat.tool': ['工具', 'tool'],
  'chat.tool.running': ['调用中', 'running'],
  'chat.tool.ok': ['完成', 'ok'],
  'chat.tool.fail': ['失败', 'failed'],
  'chat.ask.title': ['需要你决定', 'Your call'],
  'chat.ask.answered': ['已选择', 'Chosen'],
  'chat.error': ['出错', 'Error'],
  'chat.empty.title': ['可以开始提问了', 'Ask for anything'],
  'chat.empty.body': [
    '让 AI 整理这份材料、给某个概念加个演示、把公式写清楚；也可以直接问它「这一段在讲什么」。它只会改动需要改动的地方。',
    'Ask it to organise this material, animate a concept, or fix the formulas — or just ask “what is this section saying?”. It changes only the lines that need changing.'
  ],
  'chat.noNote.title': ['先打开一篇笔记', 'Open a note first'],
  'chat.noNote.body': ['在「笔记」里选一篇，或从「资料箱」导入一份讲义 PDF。', 'Pick one under Notes, or import a lecture PDF in the Inbox.'],
  'chat.placeholder': ['让它改笔记，或问它讲解…', 'Ask for a change, or ask it to explain…'],
  'chat.send': ['发送', 'Send'],
  'chat.mode.auto': ['自动', 'Auto'],
  'chat.mode.auto.hint': ['由 AI 判断是改笔记还是讲解', 'Let the agent decide whether to edit or explain'],
  'chat.mode.edit': ['改笔记', 'Edit note'],
  'chat.mode.edit.hint': ['明确要求它修改 note.md', 'Tell it to change note.md'],
  'chat.mode.explain': ['只讲解', 'Explain only'],
  'chat.mode.explain.hint': ['只回答问题，不改动笔记', 'Answer the question without touching the note'],
  'chat.mode.editPrefix': ['[改笔记]', '[Edit the note]'],
  'chat.mode.explainPrefix': ['[只讲解，不要改动笔记]', '[Explain only — do not change the note]'],

  // ---- demo sandbox ------------------------------------------------------
  'demo.interactive': ['交互演示', 'Interactive demo'],
  'demo.sandboxed': ['沙箱渲染', 'Sandbox rendered'],
  'demo.external': ['外联', 'External requests'],
  'demo.bridge': ['桥接事件：', 'Bridge events: '],
  'demo.error': ['这个演示没有跑起来', 'This demo did not start'],
  'demo.error.hint': [
    '在右侧对 AI 说「把这个演示修好」，它会重写这一段。笔记的其余部分不受影响。',
    'Ask the agent on the right to fix this demo — it rewrites that block only, and the rest of the note is untouched.'
  ],
  'demo.error.silent': ['演示没有在 3 秒内响应，可能已被浏览器拦截。', 'The demo did not respond within three seconds; the browser may have blocked it.'],
  'demo.error.empty': ['演示跑起来了，但没有画出任何内容（绘图区为空）。', 'The demo ran but drew nothing — its drawing area is empty.'],
  'demo.blocked': ['演示片段未通过纪律校验，已拦截（不会渲染）', 'Demo blocked: it failed the discipline check, so it was not rendered.'],

  // ---- settings ----------------------------------------------------------
  'settings.title': ['设置', 'Settings'],
  'settings.sub': [
    '模型接口自由接入：已内置 DeepSeek 官方 API（deepseek-flash），也可添加任意 OpenAI 兼容端点。密钥只存本机。',
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
    '提示：DeepSeek 官方 API 默认使用 deepseek-flash；换成 deepseek-v4-pro 可获得更强推理。笔记由 DeepSeek Harness 运行时驱动，需要本机装有 Node.js 24 或更高版本（普通 Node，不是 Electron 自带的那个）。',
    'Tip: the DeepSeek official API defaults to deepseek-flash; switch to deepseek-v4-pro for harder reasoning. Notes are written by the DeepSeek Harness runtime, which needs Node.js 24 or newer installed on this machine — a plain Node, not the one bundled with Electron.'
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
