import { cosine } from './embedder.js'
import type { Memory, RecallOptions, Recalled } from './store.js'

const DEFAULT_K = 10
const DEFAULT_MIN_SCORE = 0.4

/**
 * 三通道召回（04 §2.2）：向量相似为主 + 图谱邻接 / 行为共现加成；
 * 核心 tag boost（1.2–1.4×，06 C 传播同构）+ 直锚（原文随候选返回）。
 */
export function recall(
  memories: Memory[],
  queryEmbedding: number[],
  opts: RecallOptions = {}
): Recalled[] {
  const k = opts.k ?? DEFAULT_K
  const minScore = opts.minScore ?? DEFAULT_MIN_SCORE
  const boostTags = new Set(opts.boostTags ?? [])
  const boostFactor = opts.boostFactor ?? 1.25
  const neighbors = opts.graphNeighbors ? new Set(opts.graphNeighbors('')) : new Set<string>()

  const out: Recalled[] = []
  for (const m of memories) {
    if (!m.embedding) continue
    let score = cosine(queryEmbedding, m.embedding)
    if (!Number.isFinite(score)) score = 0
    let channel: Recalled['channel'] = 'vector'
    // 图谱邻接：若候选是当前节点的邻接来源（前置/延展），加成
    if (srcIdOf(m) && neighbors.has(m.id) === true && neighbors.has(srcIdOf(m)!) === true) {
      score += 0.2
      channel = 'graph'
    }
    // 行为共现：被 boost 的核心 tag 命中 → 放大
    if (boostTags.size > 0 && m.tags.some((t) => boostTags.has(t))) {
      score *= boostFactor
    }
    if (score >= minScore) out.push({ memory: m, score, channel })
  }

  out.sort((a, b) => b.score - a.score)
  const seen = new Set<string>()
  const res: Recalled[] = []
  for (const r of out) {
    if (seen.has(r.memory.id)) continue
    seen.add(r.memory.id)
    res.push(r)
    if (res.length >= k * 3) break
  }
  return res.slice(0, k)
}

function srcIdOf(m: Memory): string | undefined {
  return m.sourceId ?? m.id
}