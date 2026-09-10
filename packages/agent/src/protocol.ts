import type { Json } from '@loomnote/core'

export interface ToolDirective {
  name: string
  args: Json
}

/** 文本标记工具协议解析（04 §5.1 双协议降级路径）：按行 `:::tool name {json}`，容忍解析坏块。 */
export function parseToolDirectives(text: string): ToolDirective[] {
  const out: ToolDirective[] = []
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^\s*:::tool\s+([a-zA-Z0-9_-]+)\s*([\s\S]*)$/)
    if (!m) continue
    out.push({ name: m[1]!, args: tolerantParse(m[2] ?? '') })
  }
  return out
}

/** 容忍 JSON(5)：去尾逗号、单引号转双引号、键不加引号时尽力，失败返回空对象。 */
export function tolerantParse(raw: string): Json {
  const t = raw.trim()
  if (!t) return {}
  try {
    return JSON.parse(t) as Json
  } catch {
    // 宽松尝试
    const relaxed = t
      .replace(/,\s*([}\]])/g, '$1') // 尾逗号
      .replace(/'([^']*)'/g, '"$1"') // 单引号
      .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":') // 无引号键
    try {
      return JSON.parse(relaxed) as Json
    } catch {
      return {}
    }
  }
}