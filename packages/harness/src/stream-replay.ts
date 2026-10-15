/**
 * Turning a committed assistant message back into a live stream.
 *
 * The SDK runtime publishes an assistant message when the step commits, not per
 * token. But every committed message carries its original model stream: runs of
 * reasoning, text and tool-argument deltas, each paired with the millisecond
 * gaps between them. Replaying those gaps reproduces the "thinking as it
 * happened" view without asking the runtime for a channel it does not expose.
 *
 * The replay is presentation only. Every consumer also receives the committed
 * event that follows it, so a dropped or cancelled replay can never change what
 * the note contains.
 *
 * @module
 */

import type { DshStreamRecord } from './types.js'

/** One visible delta recovered from a packed run. */
export interface StreamDelta {
  kind: 'thinking' | 'message'
  text: string
  /** Milliseconds from the first delta of this message. */
  atMs: number
}

export interface ExpandOptions {
  /**
   * Cap on a single inter-delta gap. Long model pauses are real, but replaying
   * a 20-second stall helps nobody; gaps are clamped, never removed.
   */
  maxGapMs?: number
}

const DEFAULT_MAX_GAP_MS = 200

/**
 * Flatten packed delta runs into an ordered, absolutely-timed delta list.
 * @param records - the committed message's `stream` array.
 * @param options - timing policy.
 * @returns deltas in model order, with monotonically non-decreasing `atMs`.
 */
export function expandStream(records: readonly DshStreamRecord[] | undefined, options: ExpandOptions = {}): StreamDelta[] {
  if (!records || records.length === 0) return []
  const maxGap = options.maxGapMs ?? DEFAULT_MAX_GAP_MS
  const deltas: StreamDelta[] = []
  let origin: number | undefined
  let clock = 0

  for (const record of records) {
    if (record.type !== 'text-chunks' && record.type !== 'reasoning-chunks') continue
    const kind: StreamDelta['kind'] = record.type === 'reasoning-chunks' ? 'thinking' : 'message'
    const gapBase = origin === undefined ? record.time0 : Math.max(0, record.time0 - origin)
    if (origin === undefined) origin = record.time0
    // A run that starts after the previous one contributes one clamped gap.
    if (deltas.length > 0) clock += Math.min(gapBase, maxGap)
    for (let i = 0; i < record.texts.length; i += 1) {
      const text = record.texts[i]
      if (typeof text !== 'string' || text.length === 0) continue
      const rawGap = record.dt[i] ?? 0
      clock += Math.min(Math.max(0, rawGap), maxGap)
      deltas.push({ kind, text, atMs: clock })
    }
  }
  return deltas
}

/** Total replay duration of a delta list, in milliseconds. */
export function replayDuration(deltas: readonly StreamDelta[]): number {
  const last = deltas[deltas.length - 1]
  return last ? last.atMs : 0
}

export interface ReplaySink {
  /** Live reasoning text. */
  onThinking(text: string): void
  /** Live answer text. */
  onMessage(text: string): void
}

export interface ReplayOptions {
  /** Playback speed multiplier; 2 replays twice as fast. Default 1. */
  speed?: number
  /**
   * Hard ceiling on total replay time. When the paced schedule would exceed it,
   * the whole replay is compressed uniformly rather than truncated, so the
   * viewer still sees every token, just faster.
   */
  maxDurationMs?: number
}

/** Handle on a running replay. */
export interface ReplayHandle {
  /** Deliver every remaining delta immediately and settle. */
  flush(): void
  /** Stop without delivering the remainder. */
  cancel(): void
  /** Resolves when the replay settles, however it settled. */
  readonly finished: Promise<void>
  /** Total paced duration in milliseconds, after speed and ceiling. */
  readonly durationMs: number
}

/**
 * Play a delta list into a sink on a real clock.
 * @param deltas - output of {@link expandStream}.
 * @param sink - receives deltas in order.
 * @param options - pacing policy.
 * @returns a handle; `flush` on turn end, `cancel` on teardown.
 */
export function replayStream(deltas: readonly StreamDelta[], sink: ReplaySink, options: ReplayOptions = {}): ReplayHandle {
  const speed = options.speed && options.speed > 0 ? options.speed : 1
  const maxDurationMs = options.maxDurationMs ?? 12_000
  const natural = replayDuration(deltas) / speed
  const compression = natural > maxDurationMs && natural > 0 ? natural / maxDurationMs : 1

  let index = 0
  let timer: NodeJS.Timeout | undefined
  let settled = false
  let resolveFinished: () => void = () => undefined

  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve
  })

  const settle = (): void => {
    if (settled) return
    settled = true
    if (timer) clearTimeout(timer)
    timer = undefined
    resolveFinished()
  }

  const deliver = (delta: StreamDelta): void => {
    if (delta.kind === 'thinking') sink.onThinking(delta.text)
    else sink.onMessage(delta.text)
  }

  const step = (): void => {
    timer = undefined
    if (settled) return
    const delta = deltas[index]
    if (!delta) {
      settle()
      return
    }
    index += 1
    deliver(delta)
    const next = deltas[index]
    if (!next) {
      settle()
      return
    }
    const gap = Math.max(0, (next.atMs - delta.atMs) / speed / compression)
    if (gap <= 0) {
      // Zero-gap runs are common (whole words in one tick); drain them in a
      // microtask rather than burning a timer per token.
      queueMicrotask(step)
      return
    }
    timer = setTimeout(step, gap)
    if (typeof timer.unref === 'function') timer.unref()
  }

  queueMicrotask(step)

  return {
    get durationMs() {
      return natural / compression
    },
    get finished() {
      return finished
    },
    flush() {
      if (settled) return
      for (; index < deltas.length; index += 1) {
        const delta = deltas[index]
        if (delta) deliver(delta)
      }
      settle()
    },
    cancel() {
      settle()
    }
  }
}
