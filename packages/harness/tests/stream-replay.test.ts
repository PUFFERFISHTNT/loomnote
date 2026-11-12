import { describe, expect, it, vi } from 'vitest'
import { expandStream, replayDuration, replayStream } from '../src/stream-replay.js'
import type { DshStreamRecord } from '../src/types.js'

const reasoning = (texts: string[], dt: number[], time0 = 1000): DshStreamRecord => ({ type: 'reasoning-chunks', time0, index: 0, dt, texts })
const text = (texts: string[], dt: number[], time0 = 1000): DshStreamRecord => ({ type: 'text-chunks', time0, index: 1, dt, texts })

describe('expanding a committed model stream', () => {
  it('keeps reasoning and answer apart, in model order', () => {
    const deltas = expandStream([reasoning(['Think', 'ing'], [0, 20]), text(['Hello'], [0])])
    expect(deltas.map((d) => [d.kind, d.text])).toEqual([
      ['thinking', 'Think'],
      ['thinking', 'ing'],
      ['message', 'Hello']
    ])
  })

  it('accumulates the original millisecond gaps', () => {
    const deltas = expandStream([reasoning(['a', 'b', 'c'], [0, 10, 30])])
    expect(deltas.map((d) => d.atMs)).toEqual([0, 10, 40])
  })

  it('clamps long pauses instead of replaying a stall', () => {
    const deltas = expandStream([reasoning(['a', 'b'], [0, 30_000])], { maxGapMs: 200 })
    expect(deltas[1]!.atMs).toBe(200)
  })

  it('skips empty deltas and unmodelled records', () => {
    const deltas = expandStream([
      { type: 'chunk', time: 1, chunk: { type: 'block-start', index: 0, blockType: 'reasoning' } },
      reasoning(['', 'kept', ''], [0, 5, 5]),
      { type: 'tool-call-chunks', time0: 1, index: 0, dt: [0], id: 'c1', args: ['{}'] }
    ])
    expect(deltas.map((d) => d.text)).toEqual(['kept'])
  })

  it('is empty for a message with no stream', () => {
    expect(expandStream(undefined)).toEqual([])
    expect(expandStream([])).toEqual([])
    expect(replayDuration([])).toBe(0)
  })
})

describe('replaying a delta list', () => {
  it('delivers every delta to its sink', async () => {
    const seen: string[] = []
    const deltas = expandStream([reasoning(['a', 'b', 'c'], [0, 0, 0]), text(['d'], [0])])
    const handle = replayStream(deltas, { onThinking: (t) => seen.push(`T${t}`), onMessage: (t) => seen.push(`M${t}`) }, { speed: 50 })
    await handle.finished
    expect(seen).toEqual(['Ta', 'Tb', 'Tc', 'Md'])
  })

  it('flush delivers the remainder immediately', async () => {
    const seen: string[] = []
    const deltas = expandStream([reasoning(['a', 'b'], [0, 5000])])
    const handle = replayStream(deltas, { onThinking: (t) => seen.push(t), onMessage: () => undefined }, { speed: 0.001 })
    handle.flush()
    await handle.finished
    expect(seen).toEqual(['a', 'b'])
  })

  it('cancel stops without delivering the remainder', async () => {
    const seen: string[] = []
    const deltas = expandStream([reasoning(['a', 'b', 'c'], [0, 5000, 5000])])
    const handle = replayStream(deltas, { onThinking: (t) => seen.push(t), onMessage: () => undefined }, { speed: 0.001 })
    handle.cancel()
    await handle.finished
    expect(seen.length).toBeLessThan(3)
  })

  it('compresses rather than truncating when the ceiling is exceeded', async () => {
    const seen: string[] = []
    const deltas = expandStream([reasoning(['a', 'b', 'c'], [0, 10_000, 10_000])])
    const started = Date.now()
    const handle = replayStream(deltas, { onThinking: (t) => seen.push(t), onMessage: () => undefined }, { maxDurationMs: 60 })
    await handle.finished
    expect(seen).toEqual(['a', 'b', 'c'])
    expect(Date.now() - started).toBeLessThan(2000)
    expect(handle.durationMs).toBeLessThanOrEqual(61)
  })

  it('settles a replay of nothing', async () => {
    const onThinking = vi.fn()
    const handle = replayStream([], { onThinking, onMessage: () => undefined })
    await handle.finished
    expect(onThinking).not.toHaveBeenCalled()
  })
})
