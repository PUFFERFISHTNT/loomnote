export interface SSEEvent {
  data: unknown
}

/**
 * 容错 SSE 帧解析：按双换行分帧，逐行提取 `data:`，容忍半包（返回 rest 供下次拼接）。
 * 同时处理 `[DONE]` 哨兵。
 */
export function parseSSE(buffer: string): { events: SSEEvent[]; rest: string; done: boolean } {
  const events: SSEEvent[] = []
  let done = false
  let frameStart = 0
  let i = 0
  const len = buffer.length
  let rest = buffer

  while (i < len) {
    // 找 \n\n（或 \r\n\r\n）
    if (buffer[i] === '\n' && i + 1 < len && buffer[i + 1] === '\n') {
      const frame = buffer.slice(frameStart, i).trim()
      if (frame) {
        const dataLines: string[] = []
        for (const line of frame.split(/\r?\n/)) {
          if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
        }
        for (const d of dataLines) {
          if (!d) continue
          if (d === '[DONE]') { done = true; break }
          try { events.push({ data: JSON.parse(d) }) } catch { /* 忽略坏帧 */ }
        }
      }
      i += 2
      frameStart = i
    } else {
      i++
    }
  }
  if (frameStart > 0) rest = buffer.slice(frameStart)
  return { events, rest, done }
}