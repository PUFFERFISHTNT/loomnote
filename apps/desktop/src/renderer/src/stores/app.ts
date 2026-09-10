import { create } from 'zustand'
import type { AgentEvent, Note } from '@loomnote/core'
import type { HealthInfo, ImportSummary, NoteSummary, Settings } from '../../../shared/ipc.js'

interface AppState {
  health: HealthInfo | null
  settings: Settings | null
  notes: NoteSummary[]
  imports: ImportSummary[]
  /** 结构化事件（不含 delta——delta 聚合进 streamText 防洪泛） */
  events: AgentEvent[]
  /** 聚合的流式输出（VCP 式实时文本） */
  streamText: string
  busy: boolean
  runStartedAt: number | null
  error: string | null
  agentOpen: boolean
  activeNote: Note | null
  refreshAll: () => Promise<void>
  loadSettings: () => Promise<void>
  pushAgentEvent: (e: AgentEvent) => void
  clearRun: () => void
  setBusy: (b: boolean) => void
  setError: (e: string | null) => void
  clearError: () => void
  setAgentOpen: (b: boolean) => void
  setActiveNote: (n: Note | null) => void
}

export const useApp = create<AppState>((set, get) => ({
  health: null,
  settings: null,
  notes: [],
  imports: [],
  events: [],
  streamText: '',
  busy: false,
  runStartedAt: null,
  error: null,
  agentOpen: false,
  activeNote: null,

  async refreshAll() {
    try {
      const [health, notes, imports] = await Promise.all([window.loomnote.health(), window.loomnote.listNotes(), window.loomnote.listImports()])
      set({ health, notes, imports })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  async loadSettings() {
    try {
      set({ settings: await window.loomnote.getSettings() })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  pushAgentEvent(e) {
    const s = get()
    if (e.type === 'delta') {
      // delta 聚合：只更新 streamText，不进事件列表（防洪泛）
      set({ streamText: (s.streamText + e.text).slice(-4000) })
      return
    }
    if (e.type === 'plan') set({ events: [e], streamText: '' })
    else set({ events: [...s.events.slice(-99), e] })
    if (e.type === 'done' || e.type === 'error') set({ runStartedAt: null })
  },

  clearRun() {
    set({ events: [], streamText: '' })
  },

  setBusy(b) {
    set({ busy: b, runStartedAt: b ? Date.now() : get().runStartedAt })
  },
  setError(e) {
    set({ error: e })
  },
  clearError() {
    set({ error: null })
  },
  setAgentOpen(b) {
    set({ agentOpen: b })
  },
  setActiveNote(n) {
    set({ activeNote: n })
  }
}))

export function noteSummaryTime(n: NoteSummary): string {
  const d = new Date(n.updatedAt)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return `今天 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export type { Note }