import { describe, it, expect } from 'vitest'
import { parseFrontMatter, extractDirectives, extractWikilinks, estimateTokens } from '../src/ir.js'

describe('parseFrontMatter', () => {
  it('解析简单 front matter 并剥离', () => {
    const { frontMatter, body } = parseFrontMatter('---\ntitle: 背包问题\ntags: [dp, 算法]\ndifficulty: 4\nsource: /l1.pdf\n---\n# 正文\n内容')
    expect(frontMatter.title).toBe('背包问题')
    expect(frontMatter.tags).toEqual(['dp', '算法'])
    expect(frontMatter.difficulty).toBe(4)
    expect(body).toContain('# 正文')
    expect(body).not.toContain('---')
  })

  it('无 front matter 时从首标题取 title', () => {
    const { frontMatter, body } = parseFrontMatter('# 第一章\nhello')
    expect(frontMatter.title).toBe('第一章')
    expect(body).toContain('hello')
  })
})

describe('extractDirectives', () => {
  it('提取 toc/demo/tool/directives', () => {
    const md = ':::toc\n\n:::demo {dp-01}\n\n:::tool note {id: 1}\n'
    const dirs = extractDirectives(md)
    expect(dirs.map((d) => d.kind)).toEqual(['toc', 'demo', 'tool'])
    expect(dirs[1]!.meta).toBe('dp-01')
  })
})

describe('extractWikilinks', () => {
  it('提取 [[双链]] 去别名去重', () => {
    expect(extractWikilinks('[[前缀和]] 与 [[完全背包|背包变体]] 与 [[前缀和]]')).toEqual(['前缀和', '完全背包'])
  })
})

describe('estimateTokens', () => {
  it('CJK 与拉丁词分别估算且单调', () => {
    const a = estimateTokens('动态规划解决背包问题的最优化')
    const b = estimateTokens('dynamic programming solves knapsack optimization problem')
    expect(a).toBeGreaterThan(0)
    expect(b).toBeGreaterThan(0)
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('a'.repeat(500))).toBeGreaterThan(estimateTokens('a'.repeat(100)))
  })
})