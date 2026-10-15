/**
 * The in-band question channel.
 *
 * The harness exposes a blocking "ask the user" tool, but an SDK client has no
 * wire method to answer it: a call would wait forever on a decision nobody can
 * deliver. LoomNote therefore asks in band instead — the agent writes a
 * `loomnote:ask` fenced block into its reply, the app turns it into clickable
 * option cards, and the student's click becomes the next user message. The
 * convention is plain text, so it also survives a model that cannot call tools.
 *
 * @module
 */

import type { HarnessOption } from './types.js'

/** Language tag used on the fence so a stray ``` block is never mistaken for a question. */
export const ASK_FENCE = 'loomnote:ask'

/** One parsed question. */
export interface ParsedAsk {
  question: string
  options: HarnessOption[]
}

/**
 * Bounds. A question is a decision, not a document: anything larger is treated
 * as ordinary prose so a malformed block can never swallow the whole answer.
 */
const MAX_QUESTION_CHARS = 400
const MAX_OPTIONS = 5
const MAX_OPTION_LABEL_CHARS = 80
const MAX_OPTION_DETAIL_CHARS = 200

/** Match a fenced block whose info string is exactly {@link ASK_FENCE}. */
const FENCE_RE = /^[ \t]*(`{3,})[ \t]*loomnote:ask[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*\1[ \t]*$/m

/**
 * Read the first well-formed question out of an assistant message.
 * @param text - the assistant message.
 * @returns the question and its options, or `null` when there is none or it is malformed.
 */
export function extractAsk(text: string): ParsedAsk | null {
  const match = FENCE_RE.exec(text)
  if (!match) return null
  const body = (match[2] ?? '').trim()
  if (!body) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const record = parsed as Record<string, unknown>

  const question = typeof record['question'] === 'string' ? record['question'].trim() : ''
  if (!question || question.length > MAX_QUESTION_CHARS) return null

  const rawOptions = Array.isArray(record['options']) ? record['options'] : []
  const options: HarnessOption[] = []
  for (const candidate of rawOptions) {
    if (options.length >= MAX_OPTIONS) break
    if (typeof candidate === 'string') {
      const label = candidate.trim()
      if (label && label.length <= MAX_OPTION_LABEL_CHARS) options.push({ label })
      continue
    }
    if (typeof candidate !== 'object' || candidate === null) continue
    const option = candidate as Record<string, unknown>
    const label = typeof option['label'] === 'string' ? option['label'].trim() : ''
    if (!label || label.length > MAX_OPTION_LABEL_CHARS) continue
    const detail = typeof option['detail'] === 'string' ? option['detail'].trim() : ''
    options.push(detail ? { label, detail: detail.slice(0, MAX_OPTION_DETAIL_CHARS) } : { label })
  }
  if (options.length < 2) return null

  return { question: question.slice(0, MAX_QUESTION_CHARS), options }
}

/**
 * Remove every question block from a message so the card is not echoed as code.
 * @param text - the assistant message.
 * @returns the message without question fences, with blank-line runs collapsed.
 */
export function stripAsk(text: string): string {
  const global = new RegExp(FENCE_RE.source, 'gm')
  return text
    .replace(global, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** The convention, as the agent is told about it. Kept next to the parser so they cannot drift. */
export const ASK_INSTRUCTION = [
  'When you need a decision from the student before you can continue, end your reply with a question block',
  'and nothing after it. Use exactly this shape:',
  '',
  '```loomnote:ask',
  '{"question":"<one sentence>","options":[{"label":"<short choice>","detail":"<optional one-line reason>"}]}',
  '```',
  '',
  'Rules: 2 to 5 options; each label is the exact text that will be sent back as the student\'s answer,',
  'so write it as a complete answer ("Animate the queueing section", not "Option A");',
  'ask only when the request is genuinely ambiguous, never to confirm something you can already see;',
  'never put a question block inside note.md.'
].join('\n')
