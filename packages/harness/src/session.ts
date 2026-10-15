/**
 * Supervisor and driver for one DeepSeek Harness SDK runtime process.
 *
 * Lifecycle: resolve a Node runtime → compose the LoomNote profile → spawn
 * `dsh --profile sdk --patch <overlay>` in the note's working directory →
 * handshake → feed prompts → shut down. The process boundary is deliberate: the
 * runtime loads native add-ons and a large plugin tree, so keeping it out of
 * the Electron main process means a harness crash is a restartable session, not
 * a dead app.
 *
 * @module
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { createJsonRpcPeer, type JsonRpcPeer } from './jsonrpc.js'
import { expandStream, replayStream, type ReplayHandle, type ReplayOptions } from './stream-replay.js'
import { extractAsk, stripAsk } from './ask.js'
import { normalizeSessionEvent } from './events.js'
import { ensureProfilePatch, LOOMNOTE_PROFILE_BASE, type ProfilePatchOptions } from './profile.js'
import { resolveNodeRuntime, type NodeRuntime } from './node-runtime.js'
import {
  DSH_METHOD,
  DSH_NOTIFICATION,
  type DshAssistantMessageData,
  type DshInitializeResult,
  type DshRawSessionEvent,
  type DshSessionEventNotification,
  type DshSessionPromptResult,
  type DshSessionStatusNotification,
  type HarnessEvent,
  type HarnessStatus
} from './types.js'

/** Environment variable names the child process reads. */
export const CHILD_ENV = {
  /** Harness home: sessions, profile and the generated overlay live here. */
  home: 'DSH_HOME',
  /** Credential for the runtime's native DeepSeek route. */
  deepseekKey: 'DEEPSEEK_API_KEY',
  /** Sandbox preset; the note workspace is the writable root. */
  permissionMode: 'DSH_PERMISSION_MODE'
} as const

/** How many stderr lines to keep for diagnostics. */
const STDERR_KEEP = 40

export interface HarnessSessionOptions {
  /** Harness home directory. Everything the runtime persists lives under it. */
  dshHome: string
  /** Working directory for the agent, and the sandbox's writable root. */
  workspaceDir: string
  /** Model route, e.g. `deepseek-official` or a route declared in the overlay. */
  provider: string
  /** Model id served by that route. */
  model: string
  /** Credential for the DeepSeek route. Empty when the route resolves its own. */
  apiKey?: string
  /** Extra environment for the child; provider keys for custom routes travel here. */
  env?: Readonly<Record<string, string>>
  /** Output-token cap for the session. */
  maxTokens?: number
  /** Reasoning effort, when the route accepts one. */
  reasoningEffort?: string
  /** Stable session identity. Reusing it resumes the persisted conversation. */
  sessionId: string
  /** Explicit Node runtime; discovery runs when omitted. */
  node?: NodeRuntime
  /** Override the runtime entry point. Tests use it; production resolves the packaged one. */
  entryPoint?: string
  /** Receives every product event, including injected host events. */
  onEvent: (event: HarnessEvent) => void
  /**
   * Receives the runtime's own durable events, before normalisation. Product
   * code does not need this; the diagnostics panel and failure messages do,
   * because a shape this build does not model still has to be inspectable.
   */
  onRawEvent?: (raw: DshRawSessionEvent) => void
  /** Settings the generated profile overlay must encode. */
  profile: Omit<ProfilePatchOptions, 'providers'> & { providers?: ProfilePatchOptions['providers'] }
  /** Pacing of the thinking/answer replay. */
  replay?: ReplayOptions
  /** Cap on a single replayed inter-token gap. Default 200 ms. */
  maxGapMs?: number
  /** How long to wait for the handshake before giving up. Default 60_000. */
  startupTimeoutMs?: number
  /** How long a graceful shutdown may take before SIGKILL. Default 4_000. */
  shutdownGraceMs?: number
}

/**
 * Resolve the runtime entry point.
 *
 * Order matters for packaging: an explicit override wins, then the environment
 * variable a packaged build sets, then normal module resolution from this
 * package, and finally resolution from the working directory — which is what
 * rescues a bundled build whose own module graph no longer contains the
 * dependency.
 *
 * @param explicit - caller-supplied entry point.
 * @returns absolute path to the runtime's CLI entry.
 */
export function resolveRuntimeEntry(explicit?: string): string {
  if (explicit) return explicit
  const fromEnv = process.env['LOOMNOTE_DSH_ENTRY']
  if (fromEnv) return fromEnv
  const roots = [import.meta.url, path.join(process.cwd(), 'noop.js')]
  const failures: string[] = []
  for (const root of roots) {
    try {
      const manifest = createRequire(root).resolve('@deepseek-ai/dsh/package.json') as string
      return path.join(path.dirname(manifest), 'lib', 'bin.js')
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error))
    }
  }
  throw new Error(
    ['The DeepSeek Harness runtime is not installed where LoomNote can find it.', 'Run `pnpm install` in the project root, or set LOOMNOTE_DSH_ENTRY to <...>/@deepseek-ai/dsh/lib/bin.js.', ...failures.map((f) => `  - ${f}`)].join('\n')
  )
}

/**
 * One live harness process plus its session.
 *
 * Not safe for concurrent `prompt` calls from multiple callers, and not
 * intended to be: a note has one conversation.
 */
export class HarnessSession {
  private readonly options: HarnessSessionOptions
  private child: ChildProcessWithoutNullStreams | null = null
  private peer: JsonRpcPeer | null = null
  private readonly toolNames = new Map<string, string>()
  private replay: ReplayHandle | null = null
  private stderrTail: string[] = []
  private currentStatus: HarnessStatus = 'stopped'
  private lastError: string | undefined
  private lastErrorMessage: string | undefined
  private stopping = false
  private readonly exitWaiters: Array<() => void> = []

  constructor(options: HarnessSessionOptions) {
    this.options = options
  }

  /** Current lifecycle state. */
  get status(): HarnessStatus {
    return this.currentStatus
  }

  /** Whether a turn is in flight. */
  get busy(): boolean {
    return this.currentStatus === 'running'
  }

  /** Recent stderr, for a diagnostics panel. */
  get diagnostics(): readonly string[] {
    return this.stderrTail
  }

  /** Inject a host-level event (file watchers, UI actions) into the same stream. */
  emit(event: HarnessEvent): void {
    this.setStatusFromEvent(event)
    this.options.onEvent(event)
  }

  /**
   * Spawn the runtime, compose the profile and complete the handshake.
   * @returns the runtime's wire identity.
   */
  async start(): Promise<DshInitializeResult> {
    if (this.child) throw new Error('harness session already started')
    this.setStatus('starting')

    const node = this.options.node ?? (await resolveNodeRuntime())
    const entry = resolveRuntimeEntry(this.options.entryPoint)
    const patch = await ensureProfilePatch(this.options.dshHome, this.options.profile)

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...this.options.env,
      [CHILD_ENV.home]: this.options.dshHome,
      [CHILD_ENV.permissionMode]: 'workspace-write',
      NO_COLOR: '1'
    }
    if (this.options.apiKey) env[CHILD_ENV.deepseekKey] = this.options.apiKey
    // An Electron-as-node parent leaks this into children and would make the
    // harness native add-ons refuse to load.
    delete env['ELECTRON_RUN_AS_NODE']

    const child = spawn(node.path, [entry, '--profile', LOOMNOTE_PROFILE_BASE, '--patch', patch], {
      cwd: this.options.workspaceDir,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })
    this.child = child

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      for (const line of chunk.split('\n')) {
        const text = line.trimEnd()
        if (!text) continue
        this.stderrTail.push(text)
        if (this.stderrTail.length > STDERR_KEEP) this.stderrTail.shift()
        if (/^(dsh:|Error|error:)/.test(text)) this.options.onEvent({ type: 'log', level: 'warn', message: text.slice(0, 400) })
      }
    })

    child.on('error', (error) => {
      this.lastError = error.message
      this.setStatus('error', error.message)
    })
    child.on('exit', (code, signal) => {
      this.peer?.dispose(`runtime exited (code=${code ?? 'null'} signal=${signal ?? 'null'})`)
      this.peer = null
      this.child = null
      this.replay?.flush()
      this.replay = null
      for (const waiter of this.exitWaiters.splice(0)) waiter()
      if (this.stopping) this.setStatus('stopped')
      else {
        const detail = this.stderrTail.slice(-3).join(' | ') || `exit code ${code ?? 'null'}`
        this.setStatus('error', this.lastError ?? detail)
      }
    })

    const peer = createJsonRpcPeer({
      readable: child.stdout,
      writable: child.stdin,
      onMalformedLine: (line) => this.options.onEvent({ type: 'log', level: 'warn', message: `unparsable runtime frame: ${line.slice(0, 200)}` }),
      onNotification: (method, params) => this.onNotification(method, params)
    })
    this.peer = peer

    const timeoutMs = this.options.startupTimeoutMs ?? 60_000
    const result = (await withTimeout(
      peer.request(DSH_METHOD.initialize, {
        cwd: this.options.workspaceDir,
        provider: this.options.provider,
        model: this.options.model,
        ...(this.options.reasoningEffort ? { reasoningEffort: this.options.reasoningEffort } : {}),
        ...(this.options.maxTokens ? { maxTokens: this.options.maxTokens } : {})
      }),
      timeoutMs,
      `harness handshake did not complete within ${timeoutMs} ms`
    )) as DshInitializeResult

    this.setStatus('ready')
    return result
  }

  /**
   * Queue one user message. The runtime answers immediately with a receipt and
   * streams the work as session events, so this never blocks on the turn.
   * @param text - the message; sent verbatim.
   * @returns the durable receipt.
   */
  async prompt(text: string): Promise<DshSessionPromptResult> {
    const peer = this.peer
    if (!peer) throw new Error('harness session is not running')
    const trimmed = text.trim()
    if (!trimmed) throw new Error('refusing to send an empty prompt')
    return (await peer.request(DSH_METHOD.prompt, {
      sessionId: this.options.sessionId,
      contentBlocks: [{ type: 'text', text: trimmed }]
    })) as DshSessionPromptResult
  }

  /**
   * Ask the runtime to dispose its tree and exit; escalate to SIGKILL when it does not.
   * @param graceMs - override for the configured shutdown grace period.
   */
  async stop(graceMs?: number): Promise<void> {
    const child = this.child
    if (!child) {
      this.setStatus('stopped')
      return
    }
    this.stopping = true
    const exited = new Promise<void>((resolve) => this.exitWaiters.push(resolve))
    const grace = graceMs ?? this.options.shutdownGraceMs ?? 4000

    try {
      await withTimeout(this.peer?.request(DSH_METHOD.shutdown) ?? Promise.resolve(), grace, 'shutdown timed out')
    } catch {
      /* fall through to the exit wait */
    }
    const finished = await Promise.race([exited.then(() => true), delay(grace).then(() => false)])
    if (!finished) {
      child.kill('SIGKILL')
      await Promise.race([exited, delay(2000)])
    }
    this.peer?.dispose('session stopped')
    this.peer = null
    this.replay?.cancel()
    this.replay = null
    this.setStatus('stopped')
  }

  /** Terminate immediately; used when the app is quitting. */
  kill(): void {
    this.stopping = true
    this.peer?.dispose('session killed')
    this.peer = null
    this.replay?.cancel()
    this.replay = null
    this.child?.kill('SIGKILL')
    this.child = null
    this.setStatus('stopped')
  }

  /* ---------------------------------------------------------------- *
   * internals
   * ---------------------------------------------------------------- */

  private setStatus(status: HarnessStatus, detail?: string): void {
    if (this.currentStatus === status && !detail) return
    this.currentStatus = status
    this.options.onEvent(detail ? { type: 'status', status, detail } : { type: 'status', status })
  }

  private setStatusFromEvent(event: HarnessEvent): void {
    if (event.type === 'status') this.currentStatus = event.status
  }

  private onNotification(method: string, params: unknown): void {
    if (method === DSH_NOTIFICATION.sessionEvent) {
      const notification = params as DshSessionEventNotification
      if (notification?.sessionId !== this.options.sessionId) return
      this.onSessionEvent(notification.event)
      return
    }
    if (method === DSH_NOTIFICATION.sessionStatus) {
      const notification = params as DshSessionStatusNotification
      if (notification?.sessionId !== this.options.sessionId) return
      if (notification.status === 'running') this.setStatus('running')
      else if (this.currentStatus === 'running') this.setStatus('idle')
    }
  }

  private onSessionEvent(raw: DshRawSessionEvent): void {
    this.options.onRawEvent?.(raw)
    if (raw.type === 'assistant/message') {
      this.onAssistantMessage(raw)
      return
    }

    const events = normalizeSessionEvent(raw, { toolName: (id) => this.toolNames.get(id) })
    for (const event of events) {
      if (event.type === 'tool-call') this.toolNames.set(event.id, event.name)
      if (event.type === 'tool-result') this.toolNames.delete(event.id)
      // A failed model call is reported twice — once on the attempt, once when
      // the turn closes. The student needs it once.
      if (event.type === 'error') {
        if (event.message === this.lastErrorMessage) continue
        this.lastErrorMessage = event.message
      }
      this.options.onEvent(event)
    }

    if (raw.type === 'turn/end') {
      // A turn that ends while text is still replaying must not leave the live
      // view ahead of the committed one.
      this.replay?.flush()
      this.replay = null
    }
  }

  private onAssistantMessage(raw: DshRawSessionEvent): void {
    const data = raw.data as DshAssistantMessageData | undefined
    if (!data) return
    const stream = data.stream

    // A new step's replay starts where the previous one ended.
    this.replay?.flush()
    const deltas = expandStream(stream, { maxGapMs: this.options.maxGapMs ?? 200 })

    const finish = (): void => {
      this.replay = null
      const committed = normalizeSessionEvent(raw)
      for (const event of committed) {
        if (event.type === 'thinking') {
          this.options.onEvent({ ...event, ms: deltas.length > 0 ? (deltas[deltas.length - 1]?.atMs ?? 0) : 0 })
          continue
        }
        if (event.type === 'message') {
          const withoutAsk = stripAsk(event.text)
          const ask = extractAsk(event.text)
          if (withoutAsk) this.options.onEvent({ type: 'message', text: withoutAsk })
          if (ask) this.options.onEvent({ type: 'ask', question: ask.question, options: ask.options })
          continue
        }
        this.options.onEvent(event)
      }
    }

    if (deltas.length === 0) {
      finish()
      return
    }

    const handle = replayStream(
      deltas,
      {
        onThinking: (text) => this.options.onEvent({ type: 'thinking-delta', text }),
        onMessage: (text) => this.options.onEvent({ type: 'message-delta', text })
      },
      this.options.replay ?? {}
    )
    this.replay = handle
    void handle.finished.then(finish)
  }
}

/** Reject when `promise` has not settled inside `ms`. */
async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms)
        if (typeof timer.unref === 'function') timer.unref()
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Sleep, without holding the event loop open. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    if (typeof timer.unref === 'function') timer.unref()
  })
}
