import { describe, expect, it } from 'vitest'
import { assistantReasoning, assistantText, attemptError, normalizeSessionEvent, toolResultFailed, toolResultText, turnEndError, turnEndReason } from '../src/events.js'
import type { DshAssistantMessageData, DshRawSessionEvent } from '../src/types.js'

const assistant: DshAssistantMessageData = {
  turn: 1,
  step: 1,
  message: {
    role: 'assistant',
    content: [
      { type: 'reasoning', text: 'weighing options' },
      { type: 'text', text: 'Here is the note.' },
      { type: 'tool-call', id: 'c1', name: 'edit', arguments: '{}' }
    ]
  },
  stream: [{ type: 'reasoning-chunks', time0: 1, index: 0, dt: [0], texts: ['weighing options'] }]
}

describe('reading an assistant message', () => {
  it('separates reasoning from the answer and ignores tool blocks', () => {
    expect(assistantReasoning(assistant)).toBe('weighing options')
    expect(assistantText(assistant)).toBe('Here is the note.')
  })

  it('tolerates a message with no content', () => {
    expect(assistantText({ turn: 1, step: 1, message: { role: 'assistant', content: [] } })).toBe('')
  })
})

describe('normalising a session event', () => {
  it('emits the committed thinking before the committed answer', () => {
    expect(normalizeSessionEvent({ type: 'assistant/message', data: assistant })).toEqual([
      { type: 'thinking', text: 'weighing options', ms: 0 },
      { type: 'message', text: 'Here is the note.' }
    ])
  })

  it('omits an empty reasoning or answer block rather than emitting a blank entry', () => {
    const silent: DshAssistantMessageData = { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: 'only text' }] } }
    expect(normalizeSessionEvent({ type: 'assistant/message', data: silent })).toEqual([{ type: 'message', text: 'only text' }])
  })

  it('pairs a tool result with the name of the call it answers', () => {
    const events = normalizeSessionEvent(
      { type: 'tool/result', data: { turn: 1, step: 1, message: { toolCallId: 'c1', content: [{ type: 'text', text: 'Updated file' }] } } },
      { toolName: (id) => (id === 'c1' ? 'edit' : undefined) }
    )
    expect(events).toEqual([{ type: 'tool-result', id: 'c1', name: 'edit', ok: true, output: 'Updated file' }])
  })

  it('drops events this build does not model instead of guessing', () => {
    expect(normalizeSessionEvent({ type: 'token-meter', data: { anything: true } })).toEqual([])
    expect(normalizeSessionEvent({ type: 'tool/call', data: {} })).toEqual([])
  })

  it('surfaces a failed turn on both the attempt and the turn boundary', () => {
    const failure = { message: 'model not found', code: 'INVALID_REQUEST' }
    const attempt: DshRawSessionEvent = { type: 'assistant/attempt', data: { stream: [{ type: 'chunk', time: 1, chunk: { type: 'finish', reason: { kind: 'error', failure } } }] } }
    expect(attemptError(attempt)).toBe('INVALID_REQUEST: model not found')
    expect(normalizeSessionEvent(attempt)).toEqual([{ type: 'error', message: 'INVALID_REQUEST: model not found' }])

    const end: DshRawSessionEvent = { type: 'turn/end', data: { turn: 1, reason: { kind: 'error', error: failure } } }
    expect(turnEndError(end.data as never)).toBe('INVALID_REQUEST: model not found')
    expect(normalizeSessionEvent(end)).toEqual([
      { type: 'error', message: 'INVALID_REQUEST: model not found' },
      { type: 'turn-end', turn: 1, reason: 'error' }
    ])
  })

  it('reports a completed turn with no error', () => {
    expect(turnEndError({ turn: 1, reason: { kind: 'completed' } })).toBeNull()
    expect(turnEndReason({ turn: 1, reason: { kind: 'completed' } })).toBe('completed')
    expect(turnEndReason({ turn: 1, reason: 'cancelled' as never })).toBe('cancelled')
    expect(turnEndReason({ turn: 1, reason: {} as never })).toBe('unknown')
  })
})

describe('reading a tool result', () => {
  it('concatenates text blocks and reports failure', () => {
    const failed = { turn: 1, step: 1, message: { toolCallId: 'c1', isError: true, content: [{ type: 'text', text: 'denied' }] } }
    expect(toolResultText(failed)).toBe('denied')
    expect(toolResultFailed(failed)).toBe(true)
    expect(toolResultFailed({ turn: 1, step: 1, message: { toolCallId: 'c1' } })).toBe(false)
  })
})
