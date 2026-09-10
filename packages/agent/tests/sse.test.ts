import { describe, it, expect } from 'vitest'
import { parseSSE } from '../src/sse.js'

describe('parseSSE', () => {
  it('解析完整帧', () => {
    const r = parseSSE('data: {"a":1}\n\ndata: [DONE]\n\n')
    expect(r.events).toHaveLength(1)
    expect(r.events[0]!.data).toEqual({ a: 1 })
    expect(r.done).toBe(true)
  })

  it('容忍半包：返回 rest 供拼接', () => {
    const r = parseSSE('data: {"a":')
    expect(r.events).toHaveLength(0)
    expect(r.rest).toContain('{"a":')
    const r2 = parseSSE(r.rest + '1}\n\n')
    expect(r2.events).toHaveLength(1)
    expect(r2.events[0]!.data).toEqual({ a: 1 })
  })

  it('忽略坏帧不抛异常', () => {
    const r = parseSSE('data: not-json\n\ndata: {"ok":true}\n\n')
    expect(r.events).toHaveLength(1)
    expect(r.events[0]!.data).toEqual({ ok: true })
  })
})