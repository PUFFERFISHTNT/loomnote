import MarkdownIt from 'markdown-it'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
import hljs from 'highlight.js'

export interface MarkdownRenderOptions {
  highlight?: boolean
}

/**
 * 正文渲染引擎（03 §6）：markdown-it + hljs + [[双链]] + :::toc/demo/details 指令。
 * 纯字符串转换（可单测）；KaTeX/Mermaid 在 DOM 水合阶段处理。
 */
export function createMarkdownIt(): MarkdownIt {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    highlight(code: string, lang: string) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return `<pre class="hljs"><code>${hljs.highlight(code, { language: lang }).value}</code></pre>`
        } catch {
          /* fallthrough */
        }
      }
      return `<pre class="hljs"><code>${escapeHtml(code)}</code></pre>`
    }
  })

  // [[双链]] → 可点链接（Obsidian 风格）
  md.inline.ruler.before('text', 'wikilink', (state: any, silent: any) => {
    const src = state.src
    if (src.slice(state.pos, state.pos + 2) !== '[[') return false
    const end = src.indexOf(']]', state.pos + 2)
    if (end < 0) return false
    const raw = src.slice(state.pos + 2, end)
    const [targetPart, labelPart] = raw.split('|').map((s: string) => s.trim())
    const target = targetPart || ''
    const display = labelPart || target
    if (silent) return true
    const open = state.push('link_open', 'a', 1)
    open.attrSet('href', `#/notes/${encodeURIComponent(target)}`)
    open.attrSet('data-wiki', target)
    open.attrSet('class', 'wiki')
    state.push('text', '', 0).content = display
    state.push('link_close', 'a', -1)
    state.pos = end + 2
    return true
  })

  // :::toc / :::demo / :::details 指令
  // :::demo 标题 + 多行 HTML + 单独行 :::  → md+html 混合渲染插槽（agent 自主决定演示位置）
  md.block.ruler.before('paragraph', 'directive', (state: any, startLine: any, endLine: any, silent: any) => {
    const start = state.bMarks[startLine]!
    const line = state.src.slice(start, state.eMarks[startLine]!)
    const m = line.match(/^:::(toc|demo|details)\b\s*(.*)$/)
    if (!m) return false
    const kind = m[1]!
    const meta = (m[2] ?? '').trim()
    if (silent) return true
    let html = ''
    let nextLine = startLine + 1
    if (kind === 'demo') {
      const inner: string[] = []
      while (nextLine < endLine) {
        const l = state.src.slice(state.bMarks[nextLine]!, state.eMarks[nextLine]!)
        if (/^\s*:::\s*$/.test(l)) break
        inner.push(l)
        nextLine++
      }
      const idx = demoSink.push(inner.join('\n')) - 1
      const title = md.utils.escapeHtml(meta.replace(/^[{\s]+|[}\s]+$/g, '') || '交互演示')
      html = `<div class="loom-demo" data-demo-idx="${idx}" data-demo-title="${title}"></div>`
      state.line = nextLine + 1
    } else {
      state.line = startLine + 1
      if (kind === 'toc') html = '<div class="loom-toc" data-toc="1"></div>'
      else if (kind === 'details') html = `<details class="loom-details"><summary>${md.utils.escapeHtml(meta || '展开')}</summary>`
    }
    const token = state.push('html_block', '', 0)
    token.content = html
    token.map = [startLine, state.line]
    return true
  })

  return md
}

let mdInstance: MarkdownIt | null = null
let demoSink: string[] = []

export interface RenderResult {
  html: string
  /** :::demo 块提取出的 HTML 片段（按 data-demo-idx 对应） */
  demos: string[]
}

export function renderMarkdown(src: string): RenderResult {
  if (!mdInstance) mdInstance = createMarkdownIt()
  demoSink = []
  const html = mdInstance.render(src)
  const demos = [...demoSink]
  demoSink = []
  return { html, demos }
}

/** DOM 水合：:::toc 自动目录 + KaTeX + Mermaid。需要真实 DOM（渲染进程）。 */
export async function hydrateMarkdown(root: HTMLElement): Promise<void> {
  // :::toc 自动按标题生成目录（就地跳转）
  for (const toc of Array.from(root.querySelectorAll<HTMLElement>('.loom-toc'))) {
    if (toc.childElementCount > 0) continue
    const heads = Array.from(root.querySelectorAll('h2, h3')).filter((h) => !h.closest('.loom-toc'))
    if (heads.length === 0) {
      toc.closest('.loom-demo, .loom-toc')?.remove()
      continue
    }
    const list = document.createElement('div')
    list.style.cssText = 'display:flex;flex-direction:column;gap:2px'
    heads.forEach((h, i) => {
      h.id = h.id || `h-${i}`
      const a = document.createElement('a')
      a.href = `#${h.id}`
      a.textContent = (h instanceof HTMLHeadingElement ? h.textContent : '') || ''
      a.style.cssText = `color:#5d7a9d;text-decoration:none;font-size:${h.tagName === 'H2' ? 13.5 : 12.5}px;padding:${h.tagName === 'H2' ? '4px' : '2px'} 0 0 10px`
      list.appendChild(a)
    })
    const label = document.createElement('div')
    label.textContent = '目录'
    label.style.cssText = 'font-weight:700;font-size:12px;color:#9b9a97;letter-spacing:.5px;margin-bottom:6px'
    toc.replaceChildren(label, list)
  }
  const { default: renderMathInElement } = await import('katex/dist/contrib/auto-render.mjs')
  try {
    renderMathInElement(root, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }], throwOnError: false })
  } catch {
    /* katex 渲染失败不阻塞 */
  }
  const mermaidBlocks = root.querySelectorAll<HTMLElement>('pre code.language-mermaid')
  if (mermaidBlocks.length) {
    const { default: mermaid } = await import('mermaid')
    mermaid.initialize({ startOnLoad: false, theme: 'neutral' })
    for (const block of mermaidBlocks) {
      try {
        const { svg } = await mermaid.render(`mm_${Math.random().toString(36).slice(2)}`, block.textContent ?? '')
        const pre = block.closest('pre')
        if (pre) pre.outerHTML = svg
      } catch {
        /* mermaid 失败保留源码 */
      }
    }
  }
}