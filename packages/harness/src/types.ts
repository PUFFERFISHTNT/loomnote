/**
 * LoomNote's own view of two contracts:
 *
 * 1. The subset of the DeepSeek Harness SDK wire protocol the app drives over
 *    stdio. These shapes are declared here on purpose instead of imported from
 *    the runtime's internal type packages: the wire is a narrow, stable,
 *    documented surface (`initialize` / `session/prompt` / `shutdown` plus four
 *    notifications), while the internal packages drag in the whole LLM and
 *    session type graph. Keeping a local declaration makes the bridge testable
 *    without the runtime installed and makes a protocol change a compile error
 *    in one file.
 *
 * 2. The product-level event vocabulary every consumer above the bridge speaks.
 *    The renderer, the IPC layer and the tests only ever see `HarnessEvent`.
 *
 * @module
 */

/* ------------------------------------------------------------------ *
 * DeepSeek Harness SDK wire protocol (client side)
 * ------------------------------------------------------------------ */

/** Handshake parameters: working directory, model route and output budget. */
export interface DshInitializeParams {
  /** Working directory recorded on the session header; the agent's sandbox root. */
  cwd: string
  /** Provider route, e.g. `deepseek-official`. */
  provider: string
  /** Model name served by that route, e.g. `deepseek-reasoner`. */
  model: string
  /** Adapter-owned reasoning effort, when the route supports one. */
  reasoningEffort?: string
  /** Positive output-token cap inherited by the session. */
  maxTokens?: number
}

/** Handshake result. `serverInfo.name` is wire-stable. */
export interface DshInitializeResult {
  serverInfo: { name: string; version: string }
}

/** Inline raster input; base64 payload plus a declared MIME type. */
export interface DshImageBlock {
  type: 'image'
  data: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
}

/** Ordinary durable text input. */
export interface DshTextBlock {
  type: 'text'
  text: string
}

/** One prompt content block. */
export type DshPromptBlock = DshTextBlock | DshImageBlock

/** One user turn on one session. */
export interface DshSessionPromptParams {
  /** Stable session identity; an unknown id lazily creates the agent + session pair. */
  sessionId: string
  contentBlocks: DshPromptBlock[]
}

/** Durable enqueue receipt for one prompt. */
export interface DshSessionPromptResult {
  /** Identity of the queued user message. */
  messageId: string
}

/** `session.event` payload: one session-log event, streamed as it is recorded. */
export interface DshSessionEventNotification {
  sessionId: string
  event: DshRawSessionEvent
}

/** `session.status` payload: whole-agent lifecycle state after a transition. */
export interface DshSessionStatusNotification {
  sessionId: string
  status: 'idle' | 'running'
}

/** Envelope of one durable session-log event. `data` carries the per-type payload. */
export interface DshRawSessionEvent {
  type: string
  seq?: number
  time?: number
  data?: unknown
}

/** Request/notification method names, kept in one place so they are greppable. */
export const DSH_METHOD = {
  initialize: 'initialize',
  prompt: 'session/prompt',
  shutdown: 'shutdown'
} as const

/** Notification method names the runtime pushes at us. */
export const DSH_NOTIFICATION = {
  sessionEvent: 'session.event',
  sessionStatus: 'session.status',
  subagentStarted: 'subagent.started',
  subagentFinished: 'subagent.finished'
} as const

/* ------------------------------------------------------------------ *
 * Durable session-log payloads we read
 * ------------------------------------------------------------------ */

/**
 * One packed delta run. The runtime never sends raw per-token frames over the
 * SDK wire, but every committed assistant message carries its original model
 * stream: runs of text, reasoning and tool-call-argument deltas, each paired
 * with the millisecond gaps between them. That is what makes a faithful
 * "thinking as it happened" replay possible after the fact.
 */
export interface DshDeltaRun {
  type: 'text-chunks' | 'reasoning-chunks'
  time0: number
  index: number
  dt: readonly number[]
  texts: readonly string[]
}

/** Packed tool-call-argument deltas; `args` accumulates the raw JSON string. */
export interface DshToolCallRun {
  type: 'tool-call-chunks'
  time0: number
  index: number
  dt: readonly number[]
  id: string
  name?: string
  args: readonly string[]
}

/** A raw timed stream chunk (block boundaries, finish reasons, usage). */
export interface DshRawChunk {
  type: 'chunk'
  time: number
  chunk: { type: string; [key: string]: unknown }
}

/** One record of a committed assistant message's original model stream. */
export type DshStreamRecord = DshDeltaRun | DshToolCallRun | DshRawChunk

/** One content block of an assembled assistant message. */
export type DshAssistantBlock =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool-call'; id: string; name: string; arguments: string }
  | { type: string; [key: string]: unknown }

/** Payload of `assistant/message`. */
export interface DshAssistantMessageData {
  turn: number
  step: number
  message: { role: 'assistant'; content: DshAssistantBlock[] }
  stream?: DshStreamRecord[]
  usage?: { inputTokens?: number; outputTokens?: number }
  interrupted?: true
}

/** Payload of `tool/call`. */
export interface DshToolCallData {
  turn: number
  step: number
  callId: string
  name: string
  arguments: string
}

/** Payload of `tool/result`. */
export interface DshToolResultData {
  turn: number
  step: number
  message: {
    toolCallId: string
    content?: Array<{ type: string; text?: string }>
    isError?: boolean
  }
}

/** Payload of `turn/end`. */
export interface DshTurnEndData {
  turn: number
  reason: { kind: string; [key: string]: unknown }
}

/* ------------------------------------------------------------------ *
 * LoomNote product events
 * ------------------------------------------------------------------ */

/** Lifecycle of the runtime process and its session. */
export type HarnessStatus = 'starting' | 'ready' | 'running' | 'idle' | 'stopped' | 'error'

/** One decision offered to the student, rendered as a clickable card. */
export interface HarnessOption {
  /** Short label; clicking it submits exactly this text as the student's answer. */
  label: string
  /** Optional one-line explanation shown under the label. */
  detail?: string
}

/**
 * Everything the UI needs, in one discriminated union. Deltas arrive live
 * (replayed with their original timing); the matching committed event always
 * follows so a consumer can reconcile without trusting the replay.
 */
export type HarnessEvent =
  /** Process/session lifecycle change. */
  | { type: 'status'; status: HarnessStatus; detail?: string }
  /** Live reasoning text, replayed at the model's original pace. */
  | { type: 'thinking-delta'; text: string }
  /** The same reasoning text, committed and complete for this step. */
  | { type: 'thinking'; text: string; ms: number }
  /** Live answer text, replayed at the model's original pace. */
  | { type: 'message-delta'; text: string }
  /** Committed answer text for one step. */
  | { type: 'message'; text: string }
  /** The model asked for a tool. `args` is the raw JSON string it produced. */
  | { type: 'tool-call'; id: string; name: string; args: string }
  /** A tool finished. `ok` is false when the call failed. */
  | { type: 'tool-result'; id: string; name: string; ok: boolean; output: string }
  /** A turn opened. */
  | { type: 'turn-start'; turn: number }
  /** A turn closed; `reason` is the runtime's own end reason. */
  | { type: 'turn-end'; turn: number; reason: string }
  /** The note file changed on disk (the agent edited it, or we seeded it). */
  | { type: 'note-changed'; path: string }
  /** The agent asked the student to choose; render as option cards. */
  | { type: 'ask'; question: string; options: HarnessOption[] }
  /** Anything that went wrong, surfaced verbatim. */
  | { type: 'error'; message: string; fatal?: boolean }
  /** Runtime diagnostics worth showing in the activity log. */
  | { type: 'log'; level: 'info' | 'warn'; message: string }

/** Token accounting for one step, when the adapter reported it. */
export interface HarnessUsage {
  inputTokens: number
  outputTokens: number
}
