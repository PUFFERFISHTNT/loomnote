import type { Json } from '@loomnote/core'
import { parseSSE } from './sse.js'

export type Role = 'system' | 'user' | 'assistant' | 'tool'

export interface ToolCall {
  id: string
  name: string
  arguments: string
}

export interface ChatMessage {
  role: Role
  content: string
  toolCalls?: ToolCall[]
  toolCallId?: string
}

export interface StreamResult {
  content: string
  toolCalls: ToolCall[]
  finishReason: string
}

export interface StreamOptions {
  onText?: (text: string) => void
  temperature?: number
}

export interface Provider {
  readonly name: string
  stream(messages: ChatMessage[], opts?: StreamOptions): Promise<StreamResult>
}

export interface OpenAICompatConfig {
  baseURL: string
  apiKey: string
  model: string
  /** 思考型模型（glm-5.3 系）输出预算过小会空内容，默认 4096 */
  maxTokens?: number
}

/**
 * OpenAI 兼容 Provider：chat/completions 流式（SSE），聚合 content 与 tool_calls（按 index）。
 * 覆盖火山方舟 / DeepSeek / Ollama 等兼容端点。
 */
export class OpenAICompatProvider implements Provider {
  readonly name = 'openai-compat'
  constructor(private cfg: OpenAICompatConfig) {}

  async stream(messages: ChatMessage[], opts: StreamOptions = {}): Promise<StreamResult> {
    const res = await fetch(`${this.cfg.baseURL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.cfg.apiKey}`
      },
      body: JSON.stringify({
        model: this.cfg.model,
        messages: messages.map(toOpenAI),
        stream: true,
        temperature: opts.temperature ?? 0.7,
        max_tokens: this.cfg.maxTokens ?? 4096
      })
    })
    if (!res.ok || !res.body) {
      throw new Error(`LLM stream failed: ${res.status} ${await res.text().catch(() => '')}`)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let content = ''
    const toolCalls = new Map<number, { id: string; name: string; args: string }>()
    let finishReason = 'stop'

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const { events, rest } = parseSSE(buf)
      buf = rest
      for (const ev of events) {
        const choices = (ev.data as { choices?: Array<{ delta?: Record<string, unknown>; finish_reason?: string }> })?.choices
        if (!choices?.length) continue
        const delta = choices[0]!.delta ?? {}
        const fr = choices[0]!.finish_reason
        if (typeof delta.content === 'string' && delta.content.length) {
          content += delta.content
          opts.onText?.(delta.content)
        }
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls as Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }>) {
            const idx = tc.index ?? 0
            const cur = toolCalls.get(idx) ?? { id: '', name: '', args: '' }
            if (tc.id) cur.id = tc.id
            if (tc.function?.name) cur.name += tc.function.name
            if (tc.function?.arguments) cur.args += tc.function.arguments
            toolCalls.set(idx, cur)
          }
        }
        if (fr) finishReason = fr
      }
    }
    return {
      content,
      toolCalls: [...toolCalls.values()].map((c) => ({ id: c.id, name: c.name, arguments: c.args })),
      finishReason
    }
  }
}

function toOpenAI(m: ChatMessage): Record<string, unknown> {
  if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId ?? '', content: m.content }
  const msg: Record<string, unknown> = { role: m.role, content: m.content }
  if (m.toolCalls?.length) {
    msg.tool_calls = m.toolCalls.map((tc) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.arguments } }))
  }
  return msg
}

/** 把工具调用结果回填为 assistant/tool 消息对（VCP 流内回环语义）。 */
export function buildToolExchange(assistantContent: string, calls: ToolCall[], results: Array<{ id: string; ok: boolean; output: string }>): ChatMessage[] {
  const msgs: ChatMessage[] = []
  msgs.push({ role: 'assistant', content: assistantContent, toolCalls: calls })
  for (const r of results) {
    msgs.push({ role: 'tool', content: r.ok ? r.output : `ERROR: ${r.output}`, toolCallId: r.id })
  }
  return msgs
}

export type { Json }