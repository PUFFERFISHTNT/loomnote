import { describe, it, expect } from 'vitest'
import { dedupe, contentHash } from '../src/dedup.js'
import { NGramEmbedder } from '../src/embedder.js'

describe('dedupe', () => {
  it('hard 去重（相同哈希）', () => {
    const items = [{ a: 1 }, { a: 2 }]
    const res = dedupe([
      { item: items[0]!, hash: 'same', vector: undefined },
      { item: items[1]!, hash: 'same', vector: undefined }
    ])
    expect(res).toHaveLength(1)
  })

  it('semantic 去重（高相似向量）', () => {
    const emb = new NGramEmbedder(64)
    const res = dedupe(
      [
        { item: 'a', hash: 'h1', vector: emb.embed('动态规划解决背包问题') },
        { item: 'b', hash: 'h2', vector: emb.embed('动态规划解决背包问题') }
      ],
      0.9
    )
    expect(res).toHaveLength(1)
  })
})

describe('contentHash', () => {
  it('幂等且对差异敏感', () => {
    expect(contentHash('abc')).toBe(contentHash('abc'))
    expect(contentHash('abc')).not.toBe(contentHash('abd'))
  })
})