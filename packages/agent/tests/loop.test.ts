import { describe, it, expect } from 'vitest'
import type { AgentEvent } from '@loomnote/core'
import { runTask } from '../src/loop.js'
import { defaultRegistry } from '../src/tools.js'
import type { ChatMessage, Provider, StreamResult } from '../src/provider.js'

class ScriptedProvider implements Provider {
  readonly name = 'scripted'
  constructor(private script: Array<() => StreamResult>) {}
  private idx = 0
  async stream(_messages: ChatMessage[]): Promise<StreamResult> {
    const fn = this.script[Math.min(this.idx++, this.script.length - 1)]!
    return fn()
  }
}

describe('runTask', () => {
  it('多步依赖：calc 工具 → 续写 → 交付，事件顺序正确', async () => {
    const provider = new ScriptedProvider([
      () => ({ content: '', toolCalls: [{ id: 'c1', name: 'calc', arguments: '{"expr":"2+3*4"}' }], finishReason: 'tool_calls' }),
      () => ({ content: '结果是 14', toolCalls: [], finishReason: 'stop' })
    ])
    const events: AgentEvent[] = []
    const res = await runTask('算 2+3*4', { provider, registry: defaultRegistry(), onEvent: (e) => events.push(e) })

    expect(res.output).toBe('结果是 14')
    expect(res.toolCalls).toBe(1)
    expect(events[0]!.type).toBe('plan')
    expect(events.some((e) => e.type === 'tool-start')).toBe(true)
    expect(events.some((e) => e.type === 'tool-result' && e.ok)).toBe(true)
    expect(events.at(-1)!.type).toBe('done')
  })

  it('文本协议降级：无原生 tool_calls 时解析 :::tool', async () => {
    const provider = new ScriptedProvider([
      () => ({ content: ':::tool calc {"expr":"3^4"}', toolCalls: [], finishReason: 'stop' }),
      () => ({ content: '81', toolCalls: [], finishReason: 'stop' })
    ])
    const res = await runTask('算 3^4', { provider, registry: defaultRegistry() })
    expect(res.toolCalls).toBe(1)
    expect(res.output).toBe('81')
  })

  it('预算截断：超过 maxSteps 返回 aborted', async () => {
    const provider = new ScriptedProvider([
      () => ({ content: '仍在思考', toolCalls: [{ id: 'x', name: 'calc', arguments: '{"expr":"1"}' }], finishReason: 'tool_calls' })
    ])
    const res = await runTask('无限循环', { provider, registry: defaultRegistry(), maxSteps: 1 })
    expect(res.aborted).toBe(true)
  })

  it('未知工具被安全降级为错误结果而非崩溃', async () => {
    const provider = new ScriptedProvider([
      () => ({ content: '', toolCalls: [{ id: 'c1', name: 'no_such_tool', arguments: '{}' }], finishReason: 'tool_calls' }),
      () => ({ content: '工具失败', toolCalls: [], finishReason: 'stop' })
    ])
    const events: AgentEvent[] = []
    const res = await runTask('调用不存在的工具', { provider, registry: defaultRegistry(), onEvent: (e) => events.push(e) })
    expect(events.some((e) => e.type === 'tool-result' && e.ok === false)).toBe(true)
    expect(res.output).toBe('工具失败')
  })

  it('AbortSignal 可中断（05 §2-5 可打断）', async () => {
    const provider = new ScriptedProvider([
      () => ({ content: '', toolCalls: [{ id: 'c1', name: 'calc', arguments: '{"expr":"1+1"}' }], finishReason: 'tool_calls' }),
      () => ({ content: '不该到达这里', toolCalls: [], finishReason: 'stop' })
    ])
    const controller = new AbortController()
    controller.abort()
    const events: AgentEvent[] = []
    const res = await runTask('被中断的任务', { provider, registry: defaultRegistry(), signal: controller.signal, onEvent: (e) => events.push(e) })
    expect(res.aborted).toBe(true)
    expect(res.steps).toBe(0)
    expect(events.some((e) => e.type === 'error' && e.message.includes('中断'))).toBe(true)
  })
})