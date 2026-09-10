import { estimateTokens } from '@loomnote/core'

export interface FoldBlock {
  level: 1 | 2 | 3
  title: string
  content: string
  tokens: number
}

export interface FoldResult {
  blocks: FoldBlock[]
  foldedAs: string[]
  totalTokens: number
  overflow: boolean
}

/**
 * 预算守卫 + 折叠：预算内全量块，超出部分折叠为「阈值 + 摘要」索引行（04 §2.2 注入层）。
 */
export function fold(
  blocks: FoldBlock[],
  budgetTokens: number,
  hardCap: number,
  foldThreshold = 0.6
): FoldResult {
  const ordered = [...blocks].sort((a, b) => a.level - b.level || b.tokens - a.tokens)
  const kept: FoldBlock[] = []
  const foldedAs: string[] = []
  let used = 0
  for (const b of ordered) {
    if (used + b.tokens <= budgetTokens) {
      kept.push(b)
      used += b.tokens
    } else {
      foldedAs.push(`${b.title}（${b.tokens} tokens，阈值 ${foldThreshold}）`)
    }
  }
  const overflow = used > hardCap || blocks.reduce((s, b) => s + b.tokens, 0) > hardCap
  return { blocks: kept, foldedAs, totalTokens: used, overflow }
}