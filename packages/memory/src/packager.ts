import { estimateTokens } from '@loomnote/core'
import { recall } from './recall.js'
import { fold, type FoldBlock } from './fold.js'
import type { Memory, Rule } from './store.js'

export interface PackageParts {
  queryText: string
  memories: Memory[]
  prefs: Record<string, string>
  rules: Rule[]
}

export interface MemoryPackage {
  blocks: FoldBlock[]
  foldedAs: string[]
  tokens: number
  /** 渲染成提示词插槽 {{记忆包裹}} 的内容 */
  text: string
  overBudget: boolean
}

/** 记忆包裹：召回 → 偏好/规则 → 预算折叠装配；预算 ≤1200（硬帽 1600，04 §5 C6）。 */
export function buildMemoryPackage(
  parts: PackageParts,
  queryEmbedding: number[],
  opts: { budgetTokens?: number; hardCap?: number; k?: number; boostTags?: string[] } = {}
): MemoryPackage {
  const budget = opts.budgetTokens ?? 1200
  const hardCap = opts.hardCap ?? 1600
  const recalled = recall(parts.memories, queryEmbedding, {
    k: opts.k ?? 8,
    minScore: 0.4,
    boostTags: opts.boostTags
  })

  const blocks: FoldBlock[] = []
  for (const r of recalled) {
    const title = r.memory.kind === 'rule' ? '规则' : r.memory.kind === 'preference' ? '偏好' : r.memory.tags[0] ?? '记忆'
    blocks.push({
      level: r.memory.layer as 1 | 2 | 3,
      title,
      content: r.memory.content,
      tokens: estimateTokens(r.memory.content)
    })
  }
  for (const [key, value] of Object.entries(parts.prefs)) {
    blocks.push({ level: 2, title: `偏好·${key}`, content: value, tokens: estimateTokens(value) })
  }
  for (const rule of parts.rules) {
    blocks.push({ level: 3, title: '经验规则', content: rule.body, tokens: estimateTokens(rule.body) })
  }

  const folded = fold(blocks, budget, hardCap)
  const lines = folded.blocks.map((b) => `[${b.title}] ${b.content}`)
  if (folded.foldedAs.length) lines.push(`（已折叠 ${folded.foldedAs.length} 项：${folded.foldedAs.join('；')}）`)
  return {
    blocks: folded.blocks,
    foldedAs: folded.foldedAs,
    tokens: folded.totalTokens,
    text: lines.join('\n'),
    overBudget: folded.overflow
  }
}