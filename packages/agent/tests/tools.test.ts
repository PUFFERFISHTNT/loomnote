import { describe, it, expect } from 'vitest'
import { safeCalc, builtinCalcTool, defaultRegistry } from '../src/tools.js'

describe('safeCalc', () => {
  it('正确求值四则与幂', () => {
    expect(safeCalc('2+3*4')).toBe('14')
    expect(safeCalc('(2+3)*4')).toBe('20')
    expect(safeCalc('2^10')).toBe('1024')
  })

  it('拒绝非法字符', () => {
    expect(() => safeCalc('process.env')).toThrow()
    expect(() => safeCalc('1;require("x")')).toThrow()
    expect(() => safeCalc("require('fs')")).toThrow()
  })
})

describe('defaultRegistry', () => {
  it('注册 calc 与 web_fetch 且 calc 免审', () => {
    const r = defaultRegistry()
    expect(r.get('calc')).toBeTruthy()
    expect(r.get('web_fetch')?.risk).toBe('medium')
    expect(builtinCalcTool.needsApproval).toBe(false)
  })
})