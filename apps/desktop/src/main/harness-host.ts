/**
 * The chat host: one DeepSeek Harness session per note, plus the file bridge
 * between that session and the app.
 *
 * A session is created lazily the first time a note is talked about, and it
 * stays alive so a follow-up question keeps the conversation. Because the agent
 * writes a real file, the host also watches it: every change streams to the
 * renderer as a live preview, and the durable copy is written back to the
 * database on a debounce so a crash cannot lose a finished note.
 *
 * @module
 */

import path from 'node:path'
import { HarnessSession, NOTE_FILENAME, type HarnessEvent, type HarnessStatus, type ProfilePatchOptions, type ProviderRoute } from '@loomnote/harness'
import { getActiveProvider, type Settings } from '../shared/ipc.js'
import type { AppDb } from './db.js'
import type { NoteWorkspace } from './workspace.js'
import { extractDemoBlocks, verifyDemo } from './demo-verify.js'

/** Route name used when the student configured a non-DeepSeek endpoint. */
export const CUSTOM_ROUTE = 'loomnote-active'

/** Environment variable carrying the custom route's key into the child process. */
export const CUSTOM_ROUTE_KEY_ENV = 'LOOMNOTE_ACTIVE_PROVIDER_KEY'

/** One harness event, tagged with the note it belongs to. */
export interface HostEvent {
  noteId: string
  event: HarnessEvent
}

export interface ChatHost {
  /** Queue one user message for a note, starting its session when needed. */
  send(noteId: string, text: string): Promise<{ messageId: string }>
  /** Shut a note's session down; the next message starts a fresh one. */
  stop(noteId: string): Promise<void>
  /** Lifecycle state of a note's session. */
  statusFor(noteId: string): HarnessStatus
  /** Every live session's state, for the diagnostics panel. */
  statuses(): Array<{ noteId: string; status: HarnessStatus }>
  /** Stop everything; called on quit. */
  disposeAll(): void
}

export interface ChatHostDeps {
  db: AppDb
  workspace: NoteWorkspace
  /** Harness home: sessions and the generated profile overlay live here. */
  dshHome: string
  getSettings: () => Settings
  /** Receives every event, already tagged. */
  onEvent: (payload: HostEvent) => void
  /** Receives the note file's new contents whenever it changes on disk. */
  onNoteBody: (noteId: string, body: string) => void
}

/** How long a burst of agent edits is allowed to settle before it is persisted. */
const PERSIST_DEBOUNCE_MS = 900

/**
 * Whether an endpoint belongs to the runtime's built-in DeepSeek route.
 * Anything else is declared as an extra OpenAI-compatible route in the overlay.
 */
export function isDeepSeekEndpoint(baseURL: string): boolean {
  try {
    return new URL(baseURL).hostname.endsWith('deepseek.com')
  } catch {
    return false
  }
}

/**
 * Decide which route and profile a session runs under.
 *
 * The default endpoint uses the runtime's own DeepSeek adapter. A custom
 * endpoint is declared as a route in the profile overlay, and its key travels
 * in the child process environment: no secret is ever written to the overlay.
 *
 * @param settings - current app settings.
 * @returns the session's route, model, credential and overlay options.
 */
export function describeRoute(settings: Settings): {
  provider: string
  model: string
  apiKey: string
  maxTokens: number
  env: Record<string, string>
  profile: ProfilePatchOptions
} {
  const active = getActiveProvider(settings)
  const base: Omit<ProfilePatchOptions, 'providers'> = {
    noteLanguage: settings.lang,
    chatLanguage: settings.lang,
    webEnabled: settings.webEnabled
  }

  if (isDeepSeekEndpoint(active.baseURL)) {
    return {
      provider: 'deepseek-official',
      model: active.model,
      apiKey: active.apiKey,
      maxTokens: active.maxTokens,
      env: {},
      profile: { ...base, providers: [] }
    }
  }

  const route: ProviderRoute = {
    route: CUSTOM_ROUTE,
    displayName: active.name || 'Custom endpoint',
    baseURL: active.baseURL,
    apiKeyEnv: CUSTOM_ROUTE_KEY_ENV,
    models: [active.model],
    contextWindow: 131072
  }
  return {
    provider: CUSTOM_ROUTE,
    model: active.model,
    apiKey: '',
    maxTokens: active.maxTokens,
    env: { [CUSTOM_ROUTE_KEY_ENV]: active.apiKey },
    profile: { ...base, providers: [route] }
  }
}

/**
 * Create the host.
 * @param deps - database, workspace, harness home and observers.
 */
export function createChatHost(deps: ChatHostDeps): ChatHost {
  const sessions = new Map<string, HarnessSession>()
  const unwatchers = new Map<string, () => void>()
  const statuses = new Map<string, HarnessStatus>()
  const persistTimers = new Map<string, NodeJS.Timeout>()
  const lastPersisted = new Map<string, string>()

  /**
   * How many repair rounds a note has had since its last passing check.
   *
   * A demo is delivered with its test result: it is executed, and a failure
   * goes straight back to the agent with the measurement, which keeps fixing it
   * until it passes. The student is the last person to hear about a problem,
   * and only when the budget is spent — never the first.
   */
  const repairRounds = new Map<string, number>()

  /** Rounds per user request before the failure is escalated instead. */
  const MAX_REPAIR_ROUNDS = 4

  const emit = (noteId: string, event: HarnessEvent): void => {
    if (event.type === 'status') statuses.set(noteId, event.status)
    deps.onEvent({ noteId, event })
    if (event.type === 'turn-end') void gateDemos(noteId)
  }

  /**
   * A demo is a program, so it is tested before the note keeps it.
   *
   * Every `:::demo` the agent wrote is executed in an offscreen frame; if one
   * does not render, does not respond, or throws, the agent is asked to rewrite
   * that block only — and the student is told what happened either way. This is
   * the rule the product is judged on: a note never ships a dead sandbox
   * silently.
   */
  async function gateDemos(noteId: string): Promise<void> {
    const body = await deps.workspace.read(noteId)
    if (!body) return
    const blocks = extractDemoBlocks(body)
    if (blocks.length === 0) return

    const failures: Array<{ title: string; line: number; reason: string }> = []
    for (const block of blocks) {
      const verdict = await verifyDemo(block.html)
      const summary = `demo "${block.title || `at line ${block.line}`}": ${verdict.reason} (${verdict.observation.controls} control(s), ${verdict.observation.visual} drawn element(s))`
      // Also on stdout: the demo gate is the product's own guarantee, and its
      // verdicts have to be visible in a log when something goes wrong.
      console.log(`[demo-gate] ${verdict.ok ? 'PASS' : 'FAIL'} ${summary}`)
      emit(noteId, { type: 'log', level: verdict.ok ? 'info' : 'warn', message: summary })
      if (!verdict.ok) failures.push({ title: block.title, line: block.line, reason: verdict.reason })
    }

    if (failures.length === 0) {
      const rounds = repairRounds.get(noteId) ?? 0
      if (rounds > 0) emit(noteId, { type: 'log', level: 'info', message: `all ${blocks.length} demo(s) pass their runtime check${rounds > 1 ? ` after ${rounds} repairs` : ''}` })
      repairRounds.set(noteId, 0)
      return
    }

    const round = (repairRounds.get(noteId) ?? 0) + 1
    repairRounds.set(noteId, round)
    if (round > MAX_REPAIR_ROUNDS) {
      emit(noteId, {
        type: 'error',
        message: `${failures.length} demo(s) still do not run after ${MAX_REPAIR_ROUNDS} repair attempts: ${failures.map((f) => `${f.title || 'untitled'}: ${f.reason}`).join('; ')}`
      })
      return
    }

    // The agent is handed the measurement, not a verdict: the same evidence the
    // reader would have had, at the moment the demo was written.
    const request = [
      `[Demo test failed — round ${round} of ${MAX_REPAIR_ROUNDS}]`,
      'Each demo below was executed in the same locked-down frame the reader gets. These are the results:',
      ...failures.map((f) => `- ":::demo ${f.title || '(untitled)'}" at line ${f.line}: ${f.reason}`),
      '',
      'Fix them now, in this turn. Rewrite only those :::demo blocks, in place, and follow the demo contract exactly:',
      '- one self-contained block: inline styles, one inline script, no external URLs, one root element;',
      '- the script goes at the very end of the block and runs immediately — never wait for DOMContentLoaded;',
      '- every element the script touches already exists above it in the same block;',
      '- the script must draw something (fill an SVG or canvas, or build a table) and expose two to six steps behind a visible control;',
      '- after writing, re-read the block you wrote and check that the ids your script looks up are the ids you emitted.',
      'Leave every other line of the note byte-identical. Do not explain: just fix it.'
    ].join('\n')

    emit(noteId, { type: 'log', level: 'info', message: `demo test failed — sending the result back to the agent (round ${round}/${MAX_REPAIR_ROUNDS})` })
    try {
      await sessions.get(noteId)?.prompt(request)
    } catch (error) {
      emit(noteId, { type: 'error', message: `could not ask for a demo repair: ${error instanceof Error ? error.message : String(error)}` })
    }
  }

  const persistSoon = (noteId: string, body: string): void => {
    if (lastPersisted.get(noteId) === body) return
    const existing = persistTimers.get(noteId)
    if (existing) clearTimeout(existing)
    persistTimers.set(
      noteId,
      setTimeout(() => {
        persistTimers.delete(noteId)
        const note = deps.db.getNote(noteId)
        if (!note) return
        lastPersisted.set(noteId, body)
        deps.db.saveNote({ ...note, bodyMd: body, status: 'organized', updatedAt: Date.now() })
      }, PERSIST_DEBOUNCE_MS)
    )
  }

  async function sessionFor(noteId: string): Promise<HarnessSession> {
    repairRounds.delete(noteId)
    const existing = sessions.get(noteId)
    if (existing && existing.status !== 'stopped' && existing.status !== 'error') return existing
    existing?.kill()

    const note = deps.db.getNote(noteId)
    if (!note) throw new Error(`no note with id ${noteId}`)

    const settings = deps.getSettings()
    const route = describeRoute(settings)
    await deps.workspace.ensure(noteId, note.bodyMd)

    const session = new HarnessSession({
      dshHome: deps.dshHome,
      workspaceDir: deps.workspace.dirFor(noteId),
      provider: route.provider,
      model: route.model,
      apiKey: route.apiKey,
      env: route.env,
      maxTokens: route.maxTokens,
      sessionId: `loomnote-${noteId}`,
      profile: route.profile,
      onEvent: (event) => emit(noteId, event)
    })
    sessions.set(noteId, session)

    // Stream the note file as the agent edits it, and keep the durable copy fresh.
    unwatchers.get(noteId)?.()
    lastPersisted.set(noteId, note.bodyMd)
    unwatchers.set(
      noteId,
      deps.workspace.watch(noteId, (body) => {
        deps.onNoteBody(noteId, body)
        emit(noteId, { type: 'note-changed', path: path.join(deps.workspace.dirFor(noteId), NOTE_FILENAME) })
        persistSoon(noteId, body)
      })
    )

    try {
      await session.start()
    } catch (error) {
      sessions.delete(noteId)
      unwatchers.get(noteId)?.()
      unwatchers.delete(noteId)
      const message = error instanceof Error ? error.message : String(error)
      emit(noteId, { type: 'error', message, fatal: true })
      throw error
    }
    return session
  }

  return {
    async send(noteId, text) {
      // A new instruction from the student starts a fresh repair budget.
      repairRounds.delete(noteId)
      const session = await sessionFor(noteId)
      return session.prompt(text)
    },

    async stop(noteId) {
      const session = sessions.get(noteId)
      sessions.delete(noteId)
      unwatchers.get(noteId)?.()
      unwatchers.delete(noteId)
      const timer = persistTimers.get(noteId)
      if (timer) {
        clearTimeout(timer)
        persistTimers.delete(noteId)
      }
      const body = await deps.workspace.read(noteId)
      if (body) {
        const note = deps.db.getNote(noteId)
        if (note && note.bodyMd !== body) deps.db.saveNote({ ...note, bodyMd: body, updatedAt: Date.now() })
      }
      await session?.stop()
      statuses.set(noteId, 'stopped')
    },

    statusFor(noteId) {
      return statuses.get(noteId) ?? 'stopped'
    },

    statuses() {
      return [...statuses.entries()].map(([noteId, status]) => ({ noteId, status }))
    },

    disposeAll() {
      for (const timer of persistTimers.values()) clearTimeout(timer)
      persistTimers.clear()
      for (const unwatch of unwatchers.values()) unwatch()
      unwatchers.clear()
      for (const session of sessions.values()) session.kill()
      sessions.clear()
    }
  }
}
