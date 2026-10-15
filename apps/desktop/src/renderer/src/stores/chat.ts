/**
 * Conversation state for the agent panel.
 *
 * The store folds a flat harness event stream into the shape a reader expects:
 * what they asked, what the agent is doing right now, what it has finished, and
 * which tool calls it made along the way. Two buffers carry the live view —
 * `liveThinking` and `liveAnswer` — and the committed events that follow a
 * replayed step replace them with durable entries, so a dropped replay can
 * never change what the panel ends up showing.
 *
 * @module
 */

import { create } from 'zustand'
import type { HarnessEvent, HarnessOption, HarnessStatus } from '@loomnote/harness'

/** One finished entry in the conversation. */
export type ChatItem =
  | { id: string; kind: 'user'; text: string; at: number }
  | { id: string; kind: 'answer'; text: string; thinking: string; at: number }
  | { id: string; kind: 'tool'; callId: string; name: string; args: string; ok: boolean | null; output: string; at: number }
  | { id: string; kind: 'ask'; question: string; options: HarnessOption[]; at: number; answered: string | null }
  | { id: string; kind: 'error'; text: string; at: number }

/** How many entries the panel keeps before it starts dropping the oldest. */
const MAX_ITEMS = 400

interface ChatState {
  items: ChatItem[]
  /** Reasoning text being replayed right now. */
  liveThinking: string
  /** Answer text being replayed right now. */
  liveAnswer: string
  /** Reasoning committed for the step whose answer has not arrived yet. */
  pendingThinking: string
  status: HarnessStatus
  /** Whether the agent is inside a turn. */
  running: boolean
  /** Note whose conversation is currently loaded. */
  noteId: string | null
  /** Latest note-file contents seen from disk. */
  liveBody: string

  switchNote: (noteId: string | null) => void
  ask: (text: string) => void
  apply: (event: HarnessEvent) => void
  setLiveBody: (body: string) => void
  setStatus: (status: HarnessStatus) => void
  answerAsk: (itemId: string, label: string) => void
  reset: () => void
}

let counter = 0
const nextId = (): string => `c${(counter += 1)}`

/** Trim a list to the panel's retention bound. */
function trim<T>(items: T[]): T[] {
  return items.length > MAX_ITEMS ? items.slice(items.length - MAX_ITEMS) : items
}

export const useChat = create<ChatState>((set, get) => ({
  items: [],
  liveThinking: '',
  liveAnswer: '',
  pendingThinking: '',
  status: 'stopped',
  running: false,
  noteId: null,
  liveBody: '',

  switchNote(noteId) {
    if (get().noteId === noteId) return
    set({ noteId, items: [], liveThinking: '', liveAnswer: '', pendingThinking: '', liveBody: '', running: false })
  },

  ask(text) {
    const trimmed = text.trim()
    if (!trimmed) return
    set((state) => ({ items: trim([...state.items, { id: nextId(), kind: 'user', text: trimmed, at: Date.now() }]) }))
  },

  answerAsk(itemId, label) {
    set((state) => ({ items: state.items.map((item) => (item.id === itemId && item.kind === 'ask' ? { ...item, answered: label } : item)) }))
  },

  setLiveBody(body) {
    set({ liveBody: body })
  },

  setStatus(status) {
    set({ status, running: status === 'running' || status === 'starting' })
  },

  reset() {
    set({ items: [], liveThinking: '', liveAnswer: '', pendingThinking: '' })
  },

  apply(event) {
    switch (event.type) {
      case 'status':
        set({ status: event.status, running: event.status === 'running' || event.status === 'starting' })
        if (event.status === 'starting') set({ liveThinking: '', liveAnswer: '' })
        return

      case 'thinking-delta':
        set((state) => ({ liveThinking: state.liveThinking + event.text }))
        return

      case 'message-delta':
        set((state) => ({ liveAnswer: state.liveAnswer + event.text }))
        return

      case 'thinking':
        set({ pendingThinking: event.text })
        return

      case 'message': {
        const thinking = get().pendingThinking
        set((state) => ({
          items: trim([...state.items, { id: nextId(), kind: 'answer', text: event.text, thinking, at: Date.now() }]),
          liveThinking: '',
          liveAnswer: '',
          pendingThinking: ''
        }))
        return
      }

      case 'tool-call':
        set((state) => ({
          items: trim([...state.items, { id: nextId(), kind: 'tool', callId: event.id, name: event.name, args: event.args, ok: null, output: '', at: Date.now() }])
        }))
        return

      case 'tool-result':
        set((state) => {
          const index = [...state.items].reverse().findIndex((item) => item.kind === 'tool' && item.callId === event.id)
          if (index < 0) return {}
          const at = state.items.length - 1 - index
          const target = state.items[at]
          if (!target || target.kind !== 'tool') return {}
          const merged: ChatItem = { ...target, name: target.name || event.name, ok: event.ok, output: event.output }
          const items = [...state.items]
          items[at] = merged
          return { items }
        })
        return

      case 'ask':
        set((state) => ({
          items: trim([...state.items, { id: nextId(), kind: 'ask', question: event.question, options: event.options, at: Date.now(), answered: null }])
        }))
        return

      case 'error':
        set((state) => ({ items: trim([...state.items, { id: nextId(), kind: 'error', text: event.message, at: Date.now() }]) }))
        return

      case 'turn-end': {
        // A step that streamed text but never committed it (an interrupted
        // turn) still has to appear, or the reader watches it vanish.
        const { liveAnswer, pendingThinking } = get()
        if (liveAnswer.trim()) {
          set((state) => ({
            items: trim([...state.items, { id: nextId(), kind: 'answer', text: liveAnswer, thinking: pendingThinking, at: Date.now() }]),
            liveAnswer: '',
            liveThinking: '',
            pendingThinking: ''
          }))
        }
        set({ running: false })
        return
      }

      default:
        return
    }
  }
}))
