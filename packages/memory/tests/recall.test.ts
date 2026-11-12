import { describe, it, expect } from 'vitest'
import { recall } from '../src/recall.js'
import { NGramEmbedder } from '../src/embedder.js'
import type { Memory } from '../src/store.js'

function mem(id: string, content: string, tags: string[], embedding?: number[]): Memory {
  return { id, content, tags, embedding, kind: 'chunk', layer: 1, strength: 1, accessCount: 0, lastAccessAt: 0, createdAt: 0 }
}

const emb = new NGramEmbedder(64)

describe('recall', () => {
  const memories = [
    mem('m1', '动态规划解决 0-1 背包问题的状态转移方程', ['dp', '背包'], emb.embed('动态规划解决 0-1 背包问题的状态转移方程')),
    mem('m2', '前缀和与差分数组的经典应用', ['前缀和'], emb.embed('前缀和与差分数组的经典应用')),
    mem('m3', '生物膜的磷脂双分子层结构', ['生物', '细胞膜'], emb.embed('生物膜的磷脂双分子层结构'))
  ]

  it('按相似度排序返回最相关', () => {
    const r = recall(memories, emb.embed('背包问题动态规划'), { k: 2, minScore: 0 })
    expect(r[0]!.memory.id).toBe('m1')
  })

  it('minScore 过滤无关项', () => {
    const r = recall(memories, emb.embed('细胞膜'), { k: 3, minScore: 0.05 })
    expect(r.map((x) => x.memory.id)).toContain('m3')
  })

  it('核心 tag boost 提升命中', () => {
    const r = recall(memories, emb.embed('背包'), { k: 3, minScore: 0, boostTags: ['dp'] })
    expect(r[0]!.memory.id).toBe('m1')
    expect(r[0]!.score).toBeGreaterThan(0)
  })
})