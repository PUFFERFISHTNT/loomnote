/**
 * Newline-delimited JSON-RPC 2.0 peer, client side only.
 *
 * The DeepSeek Harness SDK runtime reserves stdout for protocol frames and
 * stderr for diagnostics, so the wire is exactly one JSON object per line. This
 * module deliberately depends on nothing but Node streams: the session layer
 * supplies a child process's pipes in production and a pair of in-memory
 * streams in tests, which is what lets the whole bridge be unit-tested without
 * booting the runtime.
 *
 * @module
 */

/** A JSON-RPC request we sent and have not yet settled. */
interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  method: string
  timer: NodeJS.Timeout | undefined
}

/** Raised when the peer answers with a JSON-RPC error object. */
export class JsonRpcError extends Error {
  readonly code: number
  readonly data: unknown

  constructor(code: number, message: string, data?: unknown) {
    super(message)
    this.name = 'JsonRpcError'
    this.code = code
    this.data = data
  }
}

export interface JsonRpcPeerOptions {
  /** Frame source; typically `child.stdout`. */
  readable: NodeJS.ReadableStream
  /** Frame sink; typically `child.stdin`. */
  writable: NodeJS.WritableStream
  /** Called for every server-to-client notification. */
  onNotification?: (method: string, params: unknown) => void
  /** Called for a line that is not valid JSON, with the raw text (bounded). */
  onMalformedLine?: (line: string) => void
  /** Per-request deadline in milliseconds. `0` disables it. Default 30_000. */
  requestTimeoutMs?: number
}

/** Handle on one live connection. */
export interface JsonRpcPeer {
  /** Send a request and await its result. */
  request(method: string, params?: unknown): Promise<unknown>
  /** Send a notification (no result is expected). */
  notify(method: string, params?: unknown): void
  /** Reject every pending request and stop reading. Reason is surfaced verbatim. */
  dispose(reason?: string): void
  /** Whether the peer has been disposed. */
  readonly closed: boolean
  /** Requests still awaiting a result. */
  readonly pending: number
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

/**
 * Create a peer over an already-connected stream pair.
 * @param options - stream endpoints and callbacks.
 * @returns the peer handle.
 */
export function createJsonRpcPeer(options: JsonRpcPeerOptions): JsonRpcPeer {
  const { readable, writable, onNotification, onMalformedLine } = options
  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  const pending = new Map<number, Pending>()
  let nextId = 1
  let buffer = ''
  let closed = false
  let closeReason = 'peer disposed'

  const failAll = (reason: string): void => {
    for (const [, entry] of pending) {
      if (entry.timer) clearTimeout(entry.timer)
      entry.reject(new Error(`${reason} (while awaiting ${entry.method})`))
    }
    pending.clear()
  }

  const settle = (id: number, apply: (entry: Pending) => void): void => {
    const entry = pending.get(id)
    if (!entry) return
    pending.delete(id)
    if (entry.timer) clearTimeout(entry.timer)
    apply(entry)
  }

  const handleLine = (line: string): void => {
    const trimmed = line.trim()
    if (!trimmed) return
    let message: unknown
    try {
      message = JSON.parse(trimmed)
    } catch {
      onMalformedLine?.(trimmed.slice(0, 500))
      return
    }
    if (typeof message !== 'object' || message === null) return
    const frame = message as Record<string, unknown>

    if (typeof frame['id'] === 'number') {
      const id = frame['id']
      if (frame['error'] && typeof frame['error'] === 'object') {
        const error = frame['error'] as Record<string, unknown>
        settle(id, (entry) =>
          entry.reject(new JsonRpcError(typeof error['code'] === 'number' ? error['code'] : -1, String(error['message'] ?? 'unknown error'), error['data']))
        )
        return
      }
      settle(id, (entry) => entry.resolve(frame['result']))
      return
    }

    if (typeof frame['method'] === 'string') {
      try {
        onNotification?.(frame['method'], frame['params'])
      } catch (error) {
        // A consumer throwing must never take the transport down with it.
        onMalformedLine?.(`notification handler failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  const onData = (chunk: Buffer | string): void => {
    buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
    for (;;) {
      const newline = buffer.indexOf('\n')
      if (newline < 0) break
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      handleLine(line)
    }
  }

  const onEnd = (): void => {
    if (closed) return
    closed = true
    failAll(closeReason)
  }

  readable.on('data', onData)
  readable.on('end', onEnd)
  readable.on('close', onEnd)

  return {
    get closed() {
      return closed
    },
    get pending() {
      return pending.size
    },

    request(method, params) {
      if (closed) return Promise.reject(new Error(`${closeReason} (cannot send ${method})`))
      const id = nextId++
      return new Promise<unknown>((resolve, reject) => {
        const timer =
          timeoutMs > 0
            ? setTimeout(() => {
                settle(id, (entry) => entry.reject(new Error(`${method} timed out after ${timeoutMs} ms`)))
              }, timeoutMs)
            : undefined
        if (timer && typeof timer.unref === 'function') timer.unref()
        pending.set(id, { resolve, reject, method, timer })
        try {
          writable.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
        } catch (error) {
          settle(id, (entry) => entry.reject(error instanceof Error ? error : new Error(String(error))))
        }
      })
    },

    notify(method, params) {
      if (closed) return
      try {
        writable.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`)
      } catch {
        /* a notification has no result to fail into */
      }
    },

    dispose(reason) {
      if (reason) closeReason = reason
      if (closed) return
      closed = true
      readable.off('data', onData)
      readable.off('end', onEnd)
      readable.off('close', onEnd)
      failAll(closeReason)
    }
  }
}
