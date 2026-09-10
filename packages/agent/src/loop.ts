import type { AgentEvent, Json } from '@loomnote/core'
import type { ChatMessage, Provider, ToolCall } from './provider.js'
import { buildToolExchange } from './provider.js'
import { parseToolDirectives } from './protocol.js'
import type { ToolRegistry } from './tools.js'

export interface LoopOptions {
  provider: Provider
  registry: ToolRegistry
  systemPrompt?: string
  maxSteps?: number
  maxToolCalls?: number
  onEvent?: (event: AgentEvent) => void
  checkpointEvery?: number
  approval?: (tool: string, args: unknown) => Promise<boolean> | boolean
  /** 中断信号（05 §2-5「可打断」）：abort 后当前步收尾即停 */
  signal?: AbortSignal
}

export interface LoopResult {
  output: string
  steps: number
  toolCalls: number
  aborted: boolean
}

/**
 * Agent Loop（Harness 运行时，自建薄版 = 文档 03 §5.1 回退实现）：
 * 规划-行动-观察；双协议（原生 tool_calls + :::tool 文本标记）；预算/超时/检查点事件流。
 */
export async function runTask(task: string, opts: LoopOptions): Promise<LoopResult> {
  const maxSteps = opts.maxSteps ?? 8
  const maxToolCalls = opts.maxToolCalls ?? 3
  const checkpointEvery = opts.checkpointEvery ?? 2
  const emit = (e: AgentEvent) => opts.onEvent?.(e)

  const messages: ChatMessage[] = []
  if (opts.systemPrompt) messages.push({ role: 'system', content: opts.systemPrompt })
  messages.push({ role: 'user', content: task })

  let steps = 0
  let toolCalls = 0
  let finalOutput = ''
  emit({ type: 'plan', plan: task })

  for (;;) {
    if (steps >= maxSteps) { emit({ type: 'error', message: `超过最大步数 ${maxSteps}` }); return { output: finalOutput, steps, toolCalls, aborted: true } }
    if (opts.signal?.aborted) { emit({ type: 'error', message: '已中断（用户停止）' }); return { output: finalOutput, steps, toolCalls, aborted: true } }
    steps += 1

    const result = await opts.provider.stream(messages, { onText: (t) => emit({ type: 'delta', text: t }) })
    finalOutput = result.content

    // 原生 tool_calls
    let calls: ToolCall[] = result.toolCalls.length
      ? result.toolCalls
      : parseToolDirectives(result.content).map((d) => ({ id: `t_${steps}_${d.name}`, name: d.name, arguments: JSON.stringify(d.args) }))

    if (!calls.length) {
      emit({ type: 'done', output: result.content })
      return { output: result.content, steps, toolCalls, aborted: false }
    }

    if (toolCalls + calls.length > maxToolCalls) {
      emit({ type: 'error', message: `工具调用超过上限 ${maxToolCalls}` })
      return { output: finalOutput, steps, toolCalls, aborted: true }
    }

    const results: Array<{ id: string; ok: boolean; output: string }> = []
    for (const call of calls) {
      toolCalls += 1
      const spec = opts.registry.get(call.name)
      if (!spec) {
        emit({ type: 'tool-result', id: call.id, tool: call.name, ok: false, output: `unknown tool: ${call.name}` })
        results.push({ id: call.id, ok: false, output: `unknown tool: ${call.name}` })
        continue
      }
      let args: unknown = {}
      try { args = JSON.parse(call.arguments) } catch { args = {} }
      if (spec.needsApproval && opts.approval) {
        const ok = await opts.approval(call.name, args)
        if (!ok) {
          emit({ type: 'tool-result', id: call.id, tool: call.name, ok: false, output: 'rejected by user' })
          results.push({ id: call.id, ok: false, output: 'rejected by user' })
          continue
        }
      }
      emit({ type: 'tool-start', id: call.id, tool: call.name, args: args as Json })
      try {
        const output = await spec.run(args as Json)
        emit({ type: 'tool-result', id: call.id, tool: call.name, ok: true, output })
        results.push({ id: call.id, ok: true, output })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        emit({ type: 'tool-result', id: call.id, tool: call.name, ok: false, output: msg })
        results.push({ id: call.id, ok: false, output: msg })
      }
    }

    messages.push(...buildToolExchange(result.content, calls, results))
    if (steps % checkpointEvery === 0) emit({ type: 'checkpoint', step: steps })
  }
}