import { buildNoteGraph, extractStudyQuestions, scheduleReview, type ReviewCard, type ReviewProgress, type ReviewRating } from '@loomnote/core'
import type { AppDb } from './db.js'

export function createStudyService(db: AppDb) {
  function progress(): Record<string, ReviewProgress> {
    try { return JSON.parse(db.getSetting('review-progress') ?? '{}') as Record<string, ReviewProgress> } catch { return {} }
  }
  function cards(): ReviewCard[] {
    const saved = progress()
    return db.listNotes().flatMap(({ id }) => {
      const note = db.getNote(id)
      return note ? extractStudyQuestions(note).map((q) => ({ ...q, progress: saved[q.id] ?? { dueAt: 0, intervalDays: 0, repetitions: 0, lapses: 0, history: [] } })) : []
    }).sort((a, b) => a.progress.dueAt - b.progress.dueAt || a.id.localeCompare(b.id))
  }
  return {
    cards,
    rate(id: string, rating: ReviewRating): ReviewCard {
      if (!['again', 'hard', 'good', 'easy'].includes(rating)) throw new Error('Unknown review rating.')
      const card = cards().find((c) => c.id === id)
      if (!card) throw new Error('This question changed or was removed. Refresh the review queue.')
      const saved = progress()
      const next = scheduleReview(saved[id], rating, Date.now())
      saved[id] = next
      db.setSetting('review-progress', JSON.stringify(saved))
      return { ...card, progress: next }
    },
    graph() {
      return buildNoteGraph(db.listNotes().flatMap(({ id }) => { const note = db.getNote(id); return note ? [note] : [] }))
    },
    context(noteId: string): string {
      const reviewed = cards().filter((c) => c.noteId === noteId && c.progress.repetitions > 0)
      if (!reviewed.length) return ''
      return ['Student self-rated review history (not an automatic assessment):', ...reviewed.slice(0, 12).map((c) =>
        `- ${c.question}: ${c.progress.lapses} lapse(s); last rating ${c.progress.history.at(-1)?.rating}; next review ${new Date(c.progress.dueAt).toISOString()}`)].join('\n')
    }
  }
}
