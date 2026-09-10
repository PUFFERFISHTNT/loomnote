import { estimateTokens } from './ir.js'

export interface QueryFeatures {
  /** 0..1 逻辑深度 */
  logicDepth: number
  /** 0..1 信息熵（话题分散度） */
  entropy: number
  /** 0..1 被已知术语覆盖的比例 */
  coverage: number
  /** 0..1 新颖度（≈1-覆盖度） */
  novelty: number
  suggest: {
    modelTier: 'light' | 'strong'
    inject: 'summary' | 'full'
    demo: boolean
  }
}

const LOGIC_TERMS =
  /(?:证明|定理|引理|推论|递归|归纳|复杂度|渐进|等价|当且仅当|必要|充分|因此|所以|因为|于是|反之|推得|=>|⇒|\\O\(|\\Omega|\\Theta|sum|prod|int_)/gi
const FORMULA_RE = /\$\$|\$[^$\n]+\$|\\[a-zA-Z]+/g

/** 基于文本的查询特征预分析（EPA 的轻量 TS 版，评估是否有逻辑深度/新颖度，指导选模与注入深度）。 */
export function analyzeQuery(text: string, knownTerms: Iterable<string> = []): QueryFeatures {
  const t = text ?? ''
  const formulaHits = (t.match(FORMULA_RE) ?? []).length
  const logicHits = (t.match(LOGIC_TERMS) ?? []).length
  const length = Math.max(1, estimateTokens(t))

  const logicDepth = clamp01(logicHits / (length / 18) * 0.6 + formulaHits * 0.08)
  const entropy = computeEntropy(t)

  const terms = [...new Set([...knownTerms].map((t) => String(t).toLowerCase()).filter(Boolean))]
  const lower = t.toLowerCase()
  const knownHits = terms.filter((term) => lower.includes(term)).length
  const coverage = terms.length === 0 ? 0 : clamp01(knownHits / terms.length)
  const novelty = 1 - coverage

  return {
    logicDepth,
    entropy,
    coverage,
    novelty,
    suggest: {
      modelTier: logicDepth > 0.45 || novelty > 0.6 ? 'strong' : 'light',
      inject: novelty > 0.6 ? 'full' : coverage > 0.55 ? 'summary' : 'full',
      demo: logicDepth > 0.4 || novelty > 0.5
    }
  }
}

function computeEntropy(text: string): number {
  const tokens = (text.match(/[A-Za-z0-9_]+/g) ?? []).map((w) => w.toLowerCase())
  if (tokens.length === 0) return 0.5
  const counts = new Map<string, number>()
  for (const tok of tokens) counts.set(tok, (counts.get(tok) ?? 0) + 1)
  const n = tokens.length
  let h = 0
  for (const c of counts.values()) {
    const p = c / n
    h -= p * Math.log2(p)
  }
  const maxH = Math.log2(Math.max(2, counts.size))
  return clamp01(h / maxH)
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(1, v))
}