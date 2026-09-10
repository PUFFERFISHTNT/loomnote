import type { FrontMatter } from './types.js'

const FRONTMATTER_RE = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

/** 极简、容忍的 front matter 解析：key: value 或 key: [a, b]，未知键原样保留。 */
export function parseFrontMatter(md: string): { frontMatter: FrontMatter; body: string } {
  const m = md.match(FRONTMATTER_RE)
  if (!m) return { frontMatter: titleFromHeading(md), body: md }
  const fm: FrontMatter = {}
  const raw = m[1] ?? ''
  for (const line of raw.split(/\r?\n/)) {
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    const rest = line.slice(idx + 1).trim()
    const list = rest.match(/^\[(.*)\]$/)
    if (list) {
      ;(fm as Record<string, unknown>)[key] = list[1]!.split(',').map((s) => s.trim()).filter(Boolean)
    } else {
      const num = Number(rest)
      ;(fm as Record<string, unknown>)[key] = rest === '' ? undefined : (Number.isFinite(num) && rest !== '' ? num : rest)
    }
  }
  if (fm.title == null) Object.assign(fm, titleFromHeading(md.slice(m[0].length)))
  return { frontMatter: fm, body: md.slice(m[0].length) }
}

function titleFromHeading(md: string): FrontMatter {
  const h = md.match(/^#\s+(.+)$/m)
  return h ? { title: h[1]!.trim() } : {}
}

export type DirectiveKind = 'toc' | 'color' | 'demo' | 'details' | 'tool'

export interface Directive {
  kind: DirectiveKind
  meta: string
  line: number
}

/** 提取 ::: 指令块（toc / 色块 / demo / details / tool）。仅识别行首三冒号。 */
export function extractDirectives(md: string): Directive[] {
  const out: Directive[] = []
  const lines = md.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(/^:::(toc|demo|details|tool)\b\s*(.*)$/)
    if (!m) continue
    const kind = m[1] as DirectiveKind
    const meta = (m[2] ?? '').trim()
    switch (kind) {
      case 'demo': out.push({ kind, meta: meta.replace(/^\{|\}$/g, '').trim(), line: i }); break
      case 'tool': out.push({ kind, meta, line: i }); break
      case 'details': out.push({ kind, meta, line: i }); break
      default: out.push({ kind, meta, line: i })
    }
  }
  return out
}

/** 提取 [[双链]] 目标（去别名 `[[target|label]]` 取 target）。 */
export function extractWikilinks(md: string): string[] {
  const out: string[] = []
  const re = /\[\[([^\]\n]+)\]\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(md))) out.push((m[1] ?? '').split('|')[0]!.trim())
  return [...new Set(out)]
}

/** CJK 感知的 token 估算（无 tiktoken 依赖）：中文约 2.2 字/token，拉丁词按空格。 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) ?? []).length
  const rest = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ')
  const words = (rest.match(/[A-Za-z0-9_]+/g) ?? []).length
  return Math.ceil(cjk / 2.2) + words + Math.ceil((text.length - cjk) / 8)
}