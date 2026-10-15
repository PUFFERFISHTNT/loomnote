import MarkdownIt from 'markdown-it'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
import hljs from 'highlight.js'
import { t } from '../i18n.js'

export interface MarkdownRenderOptions {
  highlight?: boolean
  /**
   * Prefix for note-relative image paths.
   *
   * A note embeds figures the portable way — `![](source/pages/p012.png)` — so
   * the same file renders correctly in any editor. The renderer has no
   * filesystem access and lives on a different origin, so those paths are
   * resolved through the app's own asset scheme instead. Absolute URLs, data
   * URIs and protocol-relative paths are left exactly as the author wrote them.
   */
  assetBase?: string
}

/** Set for the duration of one `renderMarkdown` call. */
let assetBase = ''

/** Rewrite one `src` when it is a note-relative path. */
function resolveAsset(src: string): string {
  if (!assetBase) return src
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//')) return src
  const clean = src
    .replace(/^\.?\//, '')
    .split(/[\\/]/)
    .filter((part) => part && part !== '.')
    .join('/')
  return clean ? `${assetBase.replace(/\/$/, '')}/${clean.split('/').map(encodeURIComponent).join('/')}` : src
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
      let closed = false
      while (nextLine < endLine) {
        const l = state.src.slice(state.bMarks[nextLine]!, state.eMarks[nextLine]!)
        if (/^\s*:::\s*$/.test(l)) {
          closed = true
          break
        }
        // A model that forgets the closing fence must not swallow the rest of
        // the note into its demo: the block ends at the next heading too. What
        // is left is a demo that fails its runtime check and is sent back.
        if (inner.length > 0 && /^#{1,3} /.test(l)) break
        inner.push(l)
        nextLine++
      }
      const idx = demoSink.push(inner.join('\n')) - 1
      const title = md.utils.escapeHtml(meta.replace(/^[{\s]+|[}\s]+$/g, '') || '交互演示')
      html = `<div class="loom-demo" data-demo-idx="${idx}" data-demo-title="${title}"></div>`
      // Consume the closing fence itself; a heading that ended the block is the
      // next block and must still be tokenized as one.
      state.line = closed ? nextLine + 1 : nextLine
    } else if (kind === 'toc') {
      // `:::toc` is a slot the app fills, not a list the author writes. A model
      // that puts real headings inside the block — which happens, because the
      // persona's skeleton shows one right after the marker — would otherwise
      // get the whole contents list rendered twice on the page. Consume the
      // block body and keep the slot.
      // A model that writes the contents list itself closes the block with
      // `:::`, and those lines must not also render as body text. But an
      // unclosed `:::toc` is the plain slot form — and the *next* `:::` in the
      // document is then the terminator of a later block, not this one. The
      // scan therefore stops at another directive as well: if one appears
      // first, this block was never closed and only its own line is consumed.
      let cursor = startLine + 1
      let closed = false
      while (cursor < endLine) {
        const body = state.src.slice(state.bMarks[cursor]!, state.eMarks[cursor]!)
        cursor += 1
        if (/^\s*:::\s*$/.test(body)) {
          closed = true
          break
        }
        if (/^\s*:::(toc|demo|details)\b/.test(body)) break
      }
      state.line = closed ? cursor : startLine + 1
      html = '<div class="loom-toc" data-toc="1"></div>'
    } else {
      state.line = startLine + 1
      if (kind === 'details') html = `<details class="loom-details"><summary>${md.utils.escapeHtml(meta || '展开')}</summary>`
    }
    const token = state.push('html_block', '', 0)
    token.content = html
    token.map = [startLine, state.line]
    return true
  },
  // Without `alt`, markdown-it never consults this rule as a terminator for an
  // open paragraph — so a `:::demo` written on the line straight after body
  // text was swallowed into that paragraph and never became a demo at all.
  // markdown-it's own `fence` rule declares the same set.
  { alt: ['paragraph', 'reference', 'blockquote', 'list'] })

  // Resolve note-relative image paths against the note's own folder.
  md.core.ruler.push('loomnote-assets', (state: any) => {
    if (!assetBase) return false
    for (const token of state.tokens as any[]) {
      const children: any[] | undefined = token.children
      if (!children) continue
      for (const child of children) {
        if (child.type !== 'image') continue
        const src = child.attrGet('src')
        if (typeof src === 'string') child.attrSet('src', resolveAsset(src))
      }
    }
    return false
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

export function renderMarkdown(src: string, options: MarkdownRenderOptions = {}): RenderResult {
  if (!mdInstance) mdInstance = createMarkdownIt()
  demoSink = []
  assetBase = options.assetBase ?? ''
  let html: string
  try {
    html = mdInstance.render(src)
  } finally {
    assetBase = ''
  }
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
      // The window is a HashRouter: a bare `#h-2` is a route change, not an
      // anchor jump, and it lands on an empty page. Scroll instead.
      a.href = 'javascript:void(0)'
      a.setAttribute('role', 'link')
      a.tabIndex = 0
      a.dataset['target'] = h.id
      a.textContent = (h instanceof HTMLHeadingElement ? h.textContent : '') || ''
      a.style.cssText = `color:#5d7a9d;text-decoration:none;font-size:${h.tagName === 'H2' ? 13.5 : 12.5}px;padding:${h.tagName === 'H2' ? '4px' : '2px'} 0 0 10px`
      list.appendChild(a)
    })
    list.addEventListener('click', (event) => {
      const anchor = (event.target as HTMLElement | null)?.closest('a[data-target]')
      if (!anchor) return
      event.preventDefault()
      const id = anchor.getAttribute('data-target')
      const target = id ? root.querySelector(`#${CSS.escape(id)}`) : null
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    const label = document.createElement('div')
    label.textContent = t('notes.toc')
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