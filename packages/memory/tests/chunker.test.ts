import { describe, it, expect } from 'vitest'
import { chunkText } from '../src/chunker.js'

describe('chunkText', () => {
  it('短文本单块', () => {
    expect(chunkText('一句话。')).toHaveLength(1)
  })

  it('空文本返回空数组', () => {
    expect(chunkText('   ')).toEqual([])
  })

  it('长文本按预算切分且有重叠', () => {
    const seg = '这是第X句话，用来测试分块器是否正确工作。'.repeat(80)
    const chunks = chunkText(seg, { maxTokens: 120, overlapRatio: 0.1 })
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeGreaterThan(0)
    // 重叠：后一块含前一块的尾部内容（split 保分隔符、逐句回溯）
    const tail = chunks[0]!.slice(-8)
    expect(chunks[1]!).toContain(tail)
  })

  it('超长句被强制切分', () => {
    const longWord = 'a'.repeat(2000)
    const chunks = chunkText(longWord, { maxTokens: 100 })
    expect(chunks.length).toBeGreaterThan(1)
    expect(Math.max(...chunks.map((c) => c.length))).toBeLessThan(1000)
  })
})