import { describe, it, expect } from 'vitest'
import { analyzeQuery } from '../src/feature.js'

describe('analyzeQuery', () => {
  it('逻辑+公式密集 → strong 档 + demo', () => {
    const f = analyzeQuery('证明 0-1 背包的最优子结构：$$f[i][j]=max(f[i-1][j],f[i-1][j-w]+v)$$ 当且仅当……递归归纳复杂度 O(nW)', [])
    expect(f.logicDepth).toBeGreaterThan(0.3)
    expect(f.suggest.modelTier).toBe('strong')
    expect(f.suggest.demo).toBe(true)
  })

  it('已知术语覆盖高 → 熟题摘要层', () => {
    const f = analyzeQuery('背包问题 动态规划 经典例子 状态转移', ['背包问题', '动态规划', '子问题', '状态转移'])
    expect(f.coverage).toBeGreaterThan(0.5)
    expect(f.suggest.inject).toBe('summary')
  })

  it('全新领域 → full 注入 + strong', () => {
    const f = analyzeQuery('介绍一下马尔可夫链蒙特卡洛采样在贝叶斯推断里的应用', [])
    expect(f.novelty).toBeGreaterThan(0.5)
    expect(f.suggest.inject).toBe('full')
    expect(f.suggest.modelTier).toBe('strong')
  })

  it('取值均在 0..1', () => {
    const f = analyzeQuery('任意文本', [])
    for (const v of [f.logicDepth, f.entropy, f.coverage, f.novelty]) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})