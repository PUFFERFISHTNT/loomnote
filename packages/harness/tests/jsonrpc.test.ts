import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { JsonRpcError, createJsonRpcPeer } from '../src/jsonrpc.js'

/** A peer wired to in-memory pipes, plus the far end so a test can answer. */
function harness(options: { requestTimeoutMs?: number } = {}) {
  const toPeer = new PassThrough()
  const fromPeer = new PassThrough()
  const notifications: Array<{ method: string; params: unknown }> = []
  const malformed: string[] = []
  const peer = createJsonRpcPeer({
    readable: toPeer,
    writable: fromPeer,
    onNotification: (method, params) => notifications.push({ method, params }),
    onMalformedLine: (line) => malformed.push(line),
    requestTimeoutMs: options.requestTimeoutMs ?? 1000
  })

  /** Read the frames the peer has written so far. */
  const frames = async (count = 1): Promise<Array<Record<string, unknown>>> => {
    const out: Array<Record<string, unknown>> = []
    let buffer = ''
    while (out.length < count) {
      const chunk: Buffer | null = fromPeer.read()
      if (!chunk) {
        await new Promise((resolve) => setTimeout(resolve, 5))
        continue
      }
      buffer += chunk.toString('utf8')
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (line.trim()) out.push(JSON.parse(line) as Record<string, unknown>)
        newline = buffer.indexOf('\n')
      }
    }
    return out
  }

  return { peer, toPeer, fromPeer, frames, notifications, malformed }
}

describe('JSON-RPC peer', () => {
  it('resolves a request with the matching result', async () => {
    const h = harness()
    const pending = h.peer.request('initialize', { cwd: '/tmp' })
    const [frame] = await h.frames()
    expect(frame).toMatchObject({ jsonrpc: '2.0', method: 'initialize', params: { cwd: '/tmp' } })
    h.toPeer.write(`${JSON.stringify({ jsonrpc: '2.0', id: frame!['id'], result: { serverInfo: { name: 'x' } } })}\n`)
    await expect(pending).resolves.toEqual({ serverInfo: { name: 'x' } })
    expect(h.peer.pending).toBe(0)
  })

  it('rejects with a JsonRpcError carrying code and data', async () => {
    const h = harness()
    const pending = h.peer.request('session/prompt', {})
    const [frame] = await h.frames()
    h.toPeer.write(`${JSON.stringify({ jsonrpc: '2.0', id: frame!['id'], error: { code: -32602, message: 'bad params', data: { field: 'cwd' } } })}\n`)
    await expect(pending).rejects.toBeInstanceOf(JsonRpcError)
    await expect(pending.catch((e: JsonRpcError) => [e.code, e.data])).resolves.toEqual([-32602, { field: 'cwd' }])
  })

  it('routes notifications and keeps parsing after a malformed line', async () => {
    const h = harness()
    h.toPeer.write('not json at all\n')
    h.toPeer.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'session.status', params: { sessionId: 's', status: 'running' } })}\n`)
    await vi.waitFor(() => expect(h.notifications).toHaveLength(1))
    expect(h.notifications[0]).toEqual({ method: 'session.status', params: { sessionId: 's', status: 'running' } })
    expect(h.malformed).toEqual(['not json at all'])
  })

  it('reassembles a frame split across chunks', async () => {
    const h = harness()
    const payload = JSON.stringify({ jsonrpc: '2.0', method: 'session.event', params: { sessionId: 's' } })
    h.toPeer.write(payload.slice(0, 12))
    h.toPeer.write(`${payload.slice(12)}\n`)
    await vi.waitFor(() => expect(h.notifications).toHaveLength(1))
    expect(h.notifications[0]!.method).toBe('session.event')
  })

  it('rejects every pending request when the stream ends', async () => {
    const h = harness()
    const pending = h.peer.request('initialize', {})
    await h.frames()
    h.toPeer.end()
    await expect(pending).rejects.toThrow(/while awaiting initialize/)
    expect(h.peer.closed).toBe(true)
  })

  it('times a request out rather than hanging forever', async () => {
    const h = harness({ requestTimeoutMs: 30 })
    await expect(h.peer.request('initialize', {})).rejects.toThrow(/timed out after 30 ms/)
  })

  it('refuses to send after disposal', async () => {
    const h = harness()
    h.peer.dispose('runtime exited')
    await expect(h.peer.request('initialize', {})).rejects.toThrow(/runtime exited/)
  })
})
