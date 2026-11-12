import type { Note } from './types.js'
export { buildNoteGraph, type NoteGraph, type ConceptSource } from './concepts.js'

export interface StudyQuestion {
  id: string
  noteId: string
  noteTitle: string
  question: string
  answer: string
  page?: number
}

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy'
export interface ReviewProgress {
  dueAt: number
  intervalDays: number
  repetitions: number
  lapses: number
  history: Array<{ at: number; rating: ReviewRating }>
}
export interface ReviewCard extends StudyQuestion {
  progress: ReviewProgress
}

/** Stable across reordering and answer corrections; no dependency on array indices. */
function questionId(noteId: string, question: string): string {
  let hash = 2166136261
  for (const char of question.trim().toLowerCase().replace(/\s+/g, ' ')) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  }
  return `${noteId}:${(hash >>> 0).toString(36)}`
}

/** Read the agent's documented question format, plus existing numbered self-tests. */
export function extractStudyQuestions(note: Note): StudyQuestion[] {
  const lines = note.bodyMd.replace(/<!--\s*loomnote:concepts\s+[\s\S]*?-->/g, '').replace(/:::demo\b[^\n]*\n[\s\S]*?^:::\s*$/gm, '').split(/\r?\n/)
  const results: StudyQuestion[] = []
  let active = false
  let sectionDepth = 0
  let current: { question: string; lines: string[] } | undefined
  const flush = (): void => {
    if (!current) return
    const text = current.lines.join('\n').trim()
    const answerMatch = /(?:\*\*)?(?:answer|答案|解答)\s*[:：](?:\*\*)?\s*/i.exec(text)
    const answer = answerMatch ? text.slice(answerMatch.index + answerMatch[0].length).trim() : text
    const page = /(?:\bp\.?|\bpage|第)\s*(\d+)\s*页?/i.exec(answer)?.[1]
    const id = questionId(note.id, current.question)
    if (current.question && !results.some((q) => q.id === id)) results.push({
      id, noteId: note.id, noteTitle: note.title, question: current.question,
      answer, ...(page ? { page: Number(page) } : {})
    })
    current = undefined
  }
  let fence = ''
  for (const line of lines) {
    const code = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
    if (code) { fence = fence ? '' : code[0]!; continue }
    if (fence) { if (current) current.lines.push(line); continue }
    const heading = /^(#{1,6})\s+(.+)/.exec(line)
    if (heading && /^(?:(?:self[- ]?test|quiz)\b|自测题?|自检|练习题)/i.test(heading[2]!.trim())) {
      flush(); active = true; sectionDepth = heading[1]!.length; continue
    }
    if (heading && active && heading[1]!.length <= sectionDepth) { flush(); active = false }
    if (!active) continue
    const start = /^(?:#{3,6}\s+(?:(?:Q(?:uestion)?\s*\d+|问题\s*\d+)\s*[.:：、-]?\s*)?|\d+[.)、]\s+)(.+)/i.exec(line)
    if (start) {
      flush()
      // A compact question and answer on the same line is common in old notes.
      const split = /\s+(?:\*\*)?(?:Answer|答案|解答)\s*[:：]/i.exec(start[1]!)
      current = { question: (split ? start[1]!.slice(0, split.index) : start[1]!).replace(/^\*\*|\*\*$/g, '').trim(), lines: split ? [start[1]!.slice(split.index)] : [] }
    } else if (current) current.lines.push(line)
  }
  flush()
  return results
}

/** A transparent interval scheduler: failures return in ten minutes. */
export function scheduleReview(previous: ReviewProgress | undefined, rating: ReviewRating, now: number): ReviewProgress {
  const old = previous?.intervalDays ?? 0
  const intervalDays = rating === 'again' ? 0 : rating === 'hard' ? Math.max(1, old * 1.2) : rating === 'good' ? Math.max(1, old * 2.5) : Math.max(4, old * 3)
  return {
    intervalDays,
    dueAt: now + (rating === 'again' ? 10 * 60_000 : Math.round(intervalDays * 86_400_000)),
    repetitions: (previous?.repetitions ?? 0) + 1,
    lapses: (previous?.lapses ?? 0) + (rating === 'again' ? 1 : 0),
    history: [...(previous?.history ?? []), { at: now, rating }].slice(-100)
  }
}

export interface MergeChange {
  id: string
  kind: 'add' | 'update' | 'skip'
  title: string
  before: string
  after: string
  start: number
  end: number
}
interface Section { title: string; body: string; start: number; end: number }
function sections(text: string, fallback: string): Section[] {
  const starts = [...text.matchAll(/^##\s+(.+)$/gm)]
  if (!starts.length) return [{ title: fallback, body: text, start: 0, end: text.length }]
  const result: Section[] = []
  const preamble = text.slice(0, starts[0]!.index).trim()
  if (preamble.replace(/^#\s+.+$/m, '').trim()) result.push({ title: fallback, body: preamble, start: 0, end: starts[0]!.index })
  starts.forEach((m, i) => {
    const end = starts[i + 1]?.index ?? text.length
    result.push({ title: m[1]!.trim(), body: text.slice(m.index, end), start: m.index, end })
  })
  return result
}
const normal = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase()
/** Exact sections are skipped; changed headings require explicit approval. No semantic guesses. */
export function proposeMerge(base: string, incoming: string, title: string): MergeChange[] {
  const existing = sections(base, '')
  return sections(incoming, title).map((section, i) => {
    const exact = existing.find((s) => normal(s.body) === normal(section.body))
    const matches = existing.filter((s) => normal(s.title) === normal(section.title))
    const match = exact ?? (matches.length === 1 ? matches[0] : undefined)
    return {
      id: `change-${i}`, kind: exact ? 'skip' : match ? 'update' : 'add', title: section.title,
      before: match?.body ?? '', after: /^##\s/m.test(section.body) ? section.body : `## ${section.title}\n\n${section.body}`,
      start: match?.start ?? base.length, end: match?.end ?? base.length
    }
  })
}
export function applyMerge(base: string, changes: MergeChange[], selected: string[]): string {
  const accepted = changes.filter((c) => selected.includes(c.id) && c.kind !== 'skip')
  const updates = accepted.filter((c) => c.kind === 'update').sort((a, b) => b.start - a.start)
  let body = base
  let boundary = base.length
  for (const change of updates) {
    if (change.end > boundary || base.slice(change.start, change.end) !== change.before) throw new Error('Merge sections overlap or the note has changed. Prepare the merge again.')
    body = body.slice(0, change.start) + change.after.trimEnd() + '\n\n' + body.slice(change.end)
    boundary = change.start
  }
  for (const change of accepted.filter((c) => c.kind === 'add')) body += `\n\n${change.after.trim()}\n`
  return body
}
