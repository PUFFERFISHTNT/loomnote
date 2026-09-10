import { describe, it, expect } from 'vitest'
import { fold, type FoldBlock } from '../src/fold.js'

function block(title: string, tokens: number, level = 1): FoldBlock {
  return { title, content: 'x'.repeat(tokens * 4), tokens, level }
}

describe('fold', () => {
  it('预算内全部保留', () => {
    const r = fold([block('a', 100), block('b', 200)], 500, 800)
    expect(r.blocks).toHaveLength(2)
    expect(r.foldedAs).toHaveLength(0)
    expect(r.overflow).toBe(false)
  })

  it('超出预算折叠为索引', () => {
    const r = fold([block('a', 800), block('b', 800)], 1000, 2000)
    expect(r.blocks.length).toBe(1)
    expect(r.foldedAs.length).toBe(1)
  })

  it('超出硬帽标记 overflow', () => {
    const r = fold([block('a', 9000)], 1000, 2000)
    expect(r.overflow).toBe(true)
  })
})