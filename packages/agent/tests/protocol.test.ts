import { describe, it, expect } from 'vitest'
import { parseToolDirectives, tolerantParse } from '../src/protocol.js'

describe('parseToolDirectives', () => {
  it('解析文本工具块', () => {
    const dirs = parseToolDirectives('先计算结果。\n:::tool calc {"expr":"2+3*4"}\n结果如上。')
    expect(dirs).toHaveLength(1)
    expect(dirs[0]!.name).toBe('calc')
    expect(dirs[0]!.args).toEqual({ expr: '2+3*4' })
  })

  it('坏块降级为空对象不抛异常', () => {
    const dirs = parseToolDirectives(':::tool calc {broken json')
    expect(dirs[0]!.args).toEqual({})
  })
})

describe('tolerantParse', () => {
  it('去尾逗号 + 单引号转双引号', () => {
    expect(tolerantParse("{'a':1,}")).toEqual({ a: 1 })
    expect(tolerantParse('{a:2}')).toEqual({ a: 2 })
  })
})