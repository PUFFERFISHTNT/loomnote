import { describe, it, expect } from 'vitest'
import { MemoryEngine } from '../src/engine.js'
import { InMemoryStore } from '../src/memory-store.js'
import { NGramEmbedder } from '../src/embedder.js'

function makeEngine() {
  return new MemoryEngine({ store: new InMemoryStore(), embedder: new NGramEmbedder(64) })
}

describe('MemoryEngine', () => {
  it('摄取幂等：同 uri 同内容第二次 count=0', () => {
    const e = makeEngine()
    const r1 = e.ingestDocument('file://l1.pdf', '背包问题的状态转移。'.repeat(20), ['dp'])
    const r2 = e.ingestDocument('file://l1.pdf', '背包问题的状态转移。'.repeat(20), ['dp'])
    expect(r1.count).toBeGreaterThan(0)
    expect(r2.count).toBe(0)
  })

  it('buildPackage 产出文本且不超硬帽', () => {
    const e = makeEngine()
    e.ingestDocument('f1', '动态规划 前缀和 差分数组 背包 最长公共子序列'.repeat(30))
    const pkg = e.buildPackage('背包问题')
    expect(pkg.text.length).toBeGreaterThan(0)
    expect(pkg.tokens).toBeLessThanOrEqual(1600)
  })

  it('蒸馏：重复纠正 → 规则生效', () => {
    const e = makeEngine()
    e.recordBehavior({ id: '1', at: Date.now(), kind: 'edit', target: 'n', meta: { correction: '公式用单 $', domain: 'formula' } })
    e.recordBehavior({ id: '2', at: Date.now(), kind: 'edit', target: 'n', meta: { correction: '公式用单 $', domain: 'formula' } })
    const rules = e.distill()
    expect(rules.length).toBe(1)
    expect(e.activeRules().some((r) => r.body.includes('公式用单 $'))).toBe(true)
  })
})