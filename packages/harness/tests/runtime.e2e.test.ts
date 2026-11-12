/**
 * End-to-end test of the harness bridge against a real DeepSeek Harness runtime.
 *
 * This is the test the mid-term check runs live: it boots the composed LoomNote
 * profile, hands the agent one task, and asserts on the note it wrote, the
 * thinking it published, and the tool calls it made. It needs a model
 * credential, so it is skipped — loudly — when none is configured.
 *
 * Configure with either:
 *   LOOMNOTE_API_KEY=sk-...            (directly), or
 *   config/local.env                   (the app's own local config file)
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { HarnessSession, type HarnessEvent } from '../src/index.js'

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..')

/** One line per event, bounded, for failure messages. */
function summarise(event: HarnessEvent): string {
  switch (event.type) {
    case 'status':
      return `status ${event.status}${event.detail ? ` (${event.detail})` : ''}`
    case 'log':
      return `log ${event.level}: ${event.message}`
    case 'error':
      return `error: ${event.message}`
    case 'turn-start':
      return `turn-start ${event.turn}`
    case 'turn-end':
      return `turn-end ${event.turn} reason=${event.reason}`
    case 'tool-call':
      return `tool-call ${event.name} ${event.args.slice(0, 120)}`
    case 'tool-result':
      return `tool-result ${event.name} ok=${event.ok} ${event.output.slice(0, 120)}`
    case 'thinking':
      return `thinking ${event.text.length} chars`
    case 'message':
      return `message ${event.text.slice(0, 160)}`
    case 'ask':
      return `ask ${event.question}`
    case 'note-changed':
      return `note-changed ${event.path}`
    default:
      return `${event.type} …`
  }
}

/** Read `config/local.env`, the file the desktop app ships for local runs. */
function readLocalEnv(): Record<string, string> {
  const file = path.join(REPO_ROOT, 'config/local.env')
  if (!existsSync(file)) return {}
  const out: Record<string, string> = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match?.[1]) out[match[1]] = match[2] ?? ''
  }
  return out
}

const local = readLocalEnv()
const apiKey = process.env['LOOMNOTE_API_KEY'] ?? local['LOOMNOTE_API_KEY'] ?? ''
const baseURL = process.env['LOOMNOTE_BASE_URL'] ?? local['LOOMNOTE_BASE_URL'] ?? 'https://api.deepseek.com/v1'
const model = process.env['LOOMNOTE_MODEL'] ?? local['LOOMNOTE_MODEL'] ?? 'deepseek-reasoner'
const describeLive = process.env['LOOMNOTE_LIVE_TESTS'] === '1' && apiKey ? describe : describe.skip

describeLive('harness runtime (live)', () => {
  let dshHome = ''
  let workspace = ''
  let session: HarnessSession | null = null
  const events: HarnessEvent[] = []

  beforeAll(async () => {
    dshHome = await mkdtemp(path.join(tmpdir(), 'loomnote-dsh-'))
    workspace = await mkdtemp(path.join(tmpdir(), 'loomnote-ws-'))
    await writeFile(path.join(workspace, 'lecture.txt'), ['Lecture 3 — Queueing', '', 'Arrivals follow a Poisson process.', "Little's Law: L = lambda * W."].join('\n'), 'utf8')
  })

  afterAll(async () => {
    session?.kill()
    if (dshHome) await rm(dshHome, { recursive: true, force: true })
    if (workspace) await rm(workspace, { recursive: true, force: true })
  })

  it(
    'turns a lecture excerpt into note.md, streaming thinking and tool calls',
    async () => {
      session = new HarnessSession({
        dshHome,
        workspaceDir: workspace,
        provider: 'deepseek-official',
        model,
        apiKey,
        sessionId: 'e2e-note',
        maxTokens: 8192,
        profile: { noteLanguage: 'en', chatLanguage: 'en' },
        replay: { speed: 40, maxDurationMs: 1500 },
        onEvent: (event) => events.push(event)
      })

      const handshake = await session.start()
      expect(handshake.serverInfo.name).toBe('deepseek-harness-sdk-runtime')

      await session.prompt(
        [
          'Read lecture.txt in your working directory.',
          'Create note.md: a short study note about the queueing material, with a title, a :::toc line, one section,',
          "one display formula for Little's Law, a Quick recall line and one self-test question citing the page.",
          'Then reply with one short line saying what you did.'
        ].join(' ')
      )

      const deadline = Date.now() + 240_000
      while (Date.now() < deadline && !events.some((event) => event.type === 'turn-end')) {
        await new Promise((resolve) => setTimeout(resolve, 250))
      }

      const kinds = events.map((event) => event.type)
      // A live run is hard to debug from a one-line assertion, so the failure
      // message carries the whole trace.
      const trace = events.map((event) => summarise(event)).join('\n')
      expect(kinds, `no turn ended. Trace:\n${trace}`).toContain('turn-end')
      expect(kinds, `the agent never touched a tool. Trace:\n${trace}`).toContain('tool-call')
      expect(kinds, `a tool call never returned. Trace:\n${trace}`).toContain('tool-result')

      const note = await readFile(path.join(workspace, 'note.md'), 'utf8')
      expect(note).toContain(':::toc')
      expect(note.toLowerCase()).toContain('self-test')

      const thinking = events
        .filter((event): event is Extract<HarnessEvent, { type: 'thinking' }> => event.type === 'thinking')
        .map((event) => event.text)
        .join('')
      expect(thinking.length, 'a reasoning model should publish reasoning').toBeGreaterThan(0)

      const streamed = events
        .filter((event): event is Extract<HarnessEvent, { type: 'thinking-delta' }> => event.type === 'thinking-delta')
        .map((event) => event.text)
        .join('')
      expect(streamed.length).toBeGreaterThan(0)

      expect(baseURL).toContain('http')

      await session.stop()
      expect(session.status).toBe('stopped')
    },
    300_000
  )
})
