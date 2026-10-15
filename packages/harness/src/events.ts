/**
 * Translation from the runtime's durable session log to LoomNote's vocabulary.
 *
 * One rule shapes this file: the log is the truth. Everything the UI shows is
 * derived from a committed event here, and anything this module does not model
 * is dropped rather than guessed at. That keeps a runtime upgrade from turning
 * into a silent behaviour change in the product.
 *
 * The functions are pure and synchronous so they can be tested against recorded
 * session logs without booting the runtime.
 *
 * @module
 */

import type {
  DshAssistantBlock,
  DshAssistantMessageData,
  DshRawSessionEvent,
  DshToolCallData,
  DshToolResultData,
  DshTurnEndData,
  HarnessEvent
} from './types.js'

/** Durable assistant content blocks that carry visible prose. */
function blocksOfType(blocks: readonly DshAssistantBlock[] | undefined, type: 'text' | 'reasoning'): string {
  if (!blocks) return ''
  let out = ''
  for (const block of blocks) {
    if (block.type !== type) continue
    const text = (block as { text?: unknown }).text
    if (typeof text === 'string') out += text
  }
  return out
}

/**
 * Concatenate the visible answer blocks of an assistant message.
 * @param data - `assistant/message` payload.
 * @returns the answer text, or an empty string when the step produced none.
 */
export function assistantText(data: DshAssistantMessageData): string {
  return blocksOfType(data.message?.content, 'text')
}

/**
 * Concatenate the reasoning blocks of an assistant message.
 * @param data - `assistant/message` payload.
 * @returns the reasoning text, or an empty string when the model did not think out loud.
 */
export function assistantReasoning(data: DshAssistantMessageData): string {
  return blocksOfType(data.message?.content, 'reasoning')
}

/**
 * Flatten a tool result message into displayable text.
 * @param data - `tool/result` payload.
 * @returns the tool's textual output, concatenated across its blocks.
 */
export function toolResultText(data: DshToolResultData): string {
  let out = ''
  for (const block of data.message?.content ?? []) {
    if (typeof block.text === 'string') out += block.text
  }
  return out
}

/** Whether a tool result reports failure. */
export function toolResultFailed(data: DshToolResultData): boolean {
  return data.message?.isError === true
}

/**
 * Read the end reason off a `turn/end` payload, tolerating a bare string.
 * @param data - `turn/end` payload.
 * @returns the reason kind, or `'unknown'` for a shape this build does not model.
 */
export function turnEndReason(data: DshTurnEndData): string {
  const reason: unknown = data.reason
  if (typeof reason === 'string') return reason
  if (reason && typeof reason === 'object' && typeof (reason as { kind?: unknown }).kind === 'string') {
    return (reason as { kind: string }).kind
  }
  return 'unknown'
}

/**
 * Pull the provider-side failure text out of a `turn/end` payload.
 *
 * A turn that ends in `error` carries the reason the model call failed — a bad
 * model name, a rejected key, a rate limit. Dropping it would leave the student
 * with a note that silently stopped growing, which is the one failure mode this
 * product cannot afford.
 *
 * @param data - `turn/end` payload.
 * @returns the message, or `null` when the turn did not fail.
 */
export function turnEndError(data: DshTurnEndData): string | null {
  const reason: unknown = data.reason
  if (!reason || typeof reason !== 'object') return null
  const record = reason as { kind?: unknown; error?: unknown }
  if (record.kind !== 'error') return null
  const error = record.error
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message) {
      const code = (error as { code?: unknown }).code
      return typeof code === 'string' && code ? `${code}: ${message}` : message
    }
  }
  return 'the model call failed and the runtime reported no detail'
}

/**
 * Pull the failure text out of an `assistant/attempt` payload: a model call
 * that settled without producing a visible message (failed, retried, cancelled).
 * @param raw - one session-log envelope of type `assistant/attempt`.
 * @returns the message, or `null` when the attempt carries no failure.
 */
export function attemptError(raw: DshRawSessionEvent): string | null {
  const stream = (raw.data as { stream?: Array<{ chunk?: { type?: string; reason?: { kind?: string; failure?: { message?: unknown; code?: unknown } } } }> } | undefined)?.stream
  if (!Array.isArray(stream)) return null
  for (const record of stream) {
    const reason = record?.chunk?.type === 'finish' ? record.chunk.reason : undefined
    if (!reason || reason.kind !== 'error') continue
    const failure = reason.failure
    if (failure && typeof failure.message === 'string') {
      return typeof failure.code === 'string' && failure.code ? `${failure.code}: ${failure.message}` : failure.message
    }
    return 'the model call failed and the runtime reported no detail'
  }
  return null
}

/** Extra context a caller can supply that the event itself does not carry. */
export interface NormalizeContext {
  /**
   * Resolve a tool call's name from its id. The runtime's `tool/result` event
   * carries the call id but not the tool name, so a stateful caller pairs them.
   */
  toolName?: (callId: string) => string | undefined
}

/**
 * Normalise one durable session event into zero or more product events.
 *
 * `assistant/message` yields the committed `thinking` and `message` events. The
 * live deltas for the same step come from `expandStream` over the same payload
 * and are emitted by the session, not here.
 *
 * @param raw - one session-log envelope.
 * @param context - lookups the envelope does not carry.
 * @returns product events, in the order they should be shown.
 */
export function normalizeSessionEvent(raw: DshRawSessionEvent, context: NormalizeContext = {}): HarnessEvent[] {
  const data = raw.data
  switch (raw.type) {
    case 'turn/start': {
      const turn = (data as { turn?: unknown } | undefined)?.turn
      return typeof turn === 'number' ? [{ type: 'turn-start', turn }] : []
    }

    case 'turn/end': {
      const payload = data as DshTurnEndData | undefined
      if (!payload) return []
      const events: HarnessEvent[] = []
      const failure = turnEndError(payload)
      if (failure) events.push({ type: 'error', message: failure })
      events.push({ type: 'turn-end', turn: payload.turn, reason: turnEndReason(payload) })
      return events
    }

    case 'assistant/attempt': {
      const failure = attemptError(raw)
      return failure ? [{ type: 'error', message: failure }] : []
    }

    case 'assistant/message': {
      const payload = data as DshAssistantMessageData | undefined
      if (!payload) return []
      const events: HarnessEvent[] = []
      const reasoning = assistantReasoning(payload)
      if (reasoning) events.push({ type: 'thinking', text: reasoning, ms: 0 })
      const text = assistantText(payload)
      if (text) events.push({ type: 'message', text })
      return events
    }

    case 'tool/call': {
      const payload = data as DshToolCallData | undefined
      if (!payload?.callId) return []
      return [{ type: 'tool-call', id: payload.callId, name: payload.name ?? '', args: payload.arguments ?? '' }]
    }

    case 'tool/result': {
      const payload = data as DshToolResultData | undefined
      const callId = payload?.message?.toolCallId
      if (!callId) return []
      return [
        {
          type: 'tool-result',
          id: callId,
          name: context.toolName?.(callId) ?? '',
          ok: !toolResultFailed(payload as DshToolResultData),
          output: toolResultText(payload as DshToolResultData)
        }
      ]
    }

    default:
      return []
  }
}
