import type { Json } from '@loomnote/core'

export type ToolRisk = 'none' | 'low' | 'medium' | 'high'

export interface ToolSpec {
  name: string
  description: string
  parameters: Record<string, unknown>
  risk: ToolRisk
  needsApproval: boolean
  run(args: Json): Promise<string> | string
}

export class ToolRegistry {
  private tools = new Map<string, ToolSpec>()

  register(spec: ToolSpec): void {
    if (this.tools.has(spec.name)) throw new Error(`tool ${spec.name} already registered`)
    this.tools.set(spec.name, spec)
  }

  get(name: string): ToolSpec | undefined {
    return this.tools.get(name)
  }

  list(): Array<{ name: string; description: string; risk: ToolRisk; needsApproval: boolean }> {
    return [...this.tools.values()].map((t) => ({ name: t.name, description: t.description, risk: t.risk, needsApproval: t.needsApproval }))
  }
}

/** 安全计算器：严格白名单（数字/运算符/括号/空白），用受限 Function 求值，不引入任意代码执行。 */
export function safeCalc(expr: string): string {
  const clean = expr.trim()
  if (clean.length === 0) throw new Error('empty expression')
  if (!/^[0-9+\-*/().,^\s%]+$/.test(clean)) throw new Error('disallowed characters')
  const sanitized = clean.replace(/\^/g, '**')
  // eslint-disable-next-line no-new-func
  const fn = new Function(`"use strict"; return (${sanitized})`) as () => number
  const v = fn()
  if (typeof v !== 'number' || Number.isNaN(v)) throw new Error('invalid result')
  return String(v)
}

export const builtinCalcTool: ToolSpec = {
  name: 'calc',
  description: '计算数学表达式（加减乘除、幂、括号），返回数值字符串',
  parameters: { type: 'object', properties: { expr: { type: 'string' } }, required: ['expr'] },
  risk: 'low',
  needsApproval: false,
  run(args) {
    const expr = (args as { expr?: string }).expr ?? ''
    return safeCalc(expr)
  }
}

export const builtinWebFetchTool: ToolSpec = {
  name: 'web_fetch',
  description: '抓取一个网页并返回纯文本正文（截断）',
  parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
  risk: 'medium',
  needsApproval: false,
  async run(args) {
    const url = (args as { url?: string }).url ?? ''
    if (!/^https?:\/\//i.test(url)) throw new Error('only http(s) urls allowed')
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) throw new Error(`fetch ${res.status}`)
    const text = await res.text()
    // 极简去标签（正文提取交给 turndown 在 desktop 层；这里只做截断兜底）
    const stripped = text.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    return stripped.slice(0, 4000)
  }
}

export function defaultRegistry(): ToolRegistry {
  const r = new ToolRegistry()
  r.register(builtinCalcTool)
  r.register(builtinWebFetchTool)
  return r
}