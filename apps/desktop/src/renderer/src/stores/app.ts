import { create } from 'zustand'
import type { Note } from '@loomnote/core'
import type { HealthInfo, ImportSummary, NoteSummary, Settings } from '../../../shared/ipc.js'
import { initLang, setLang, t } from '../i18n.js'

/** Storage key for the rail preference; read synchronously so the first frame is right. */
const SIDEBAR_KEY = 'loomnote.sidebar.collapsed'

function readSidebarPreference(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    return false
  }
}


interface AppState {
  health: HealthInfo | null
  settings: Settings | null
  notes: NoteSummary[]
  imports: ImportSummary[]
  error: string | null
  /** Whether the agent panel is showing. */
  chatOpen: boolean
  /** Whether the navigation rail is collapsed to icons. */
  sidebarCollapsed: boolean
  /** The note the rest of the app — and the agent — is looking at. */
  activeNote: Note | null
  /**
   * The note file's contents as last seen on disk. The agent writes the file,
   * so this, not `activeNote.bodyMd`, is what the reader should see while a
   * turn is in flight.
   */
  liveBody: string
  refreshAll: () => Promise<void>
  loadSettings: () => Promise<void>
  setLang: (lang: 'zh' | 'en') => Promise<void>
  setError: (e: string | null) => void
  setChatOpen: (open: boolean) => void
  toggleSidebar: () => void
  setActiveNote: (note: Note | null) => void
  setLiveBody: (body: string) => void
}

export const useApp = create<AppState>((set, get) => ({
  health: null,
  settings: null,
  notes: [],
  imports: [],
  error: null,
  chatOpen: false,
  sidebarCollapsed: readSidebarPreference(),
  activeNote: null,
  liveBody: '',

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
      const settings = await window.loomnote.getSettings()
      set({ settings })
      // The stored preference wins; settings is the fallback for a first run.
      initLang(settings.lang === 'zh' ? 'zh' : 'en')
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  async setLang(lang) {
    setLang(lang)
    const current = get().settings
    if (!current) return
    try {
      const next = await window.loomnote.setSettings({ ...current, lang })
      set({ settings: next })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  setError(e) {
    set({ error: e })
  },
  setChatOpen(open) {
    set({ chatOpen: open })
  },
  toggleSidebar() {
    const collapsed = !get().sidebarCollapsed
    set({ sidebarCollapsed: collapsed })
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0')
    } catch {
      /* private mode: the in-memory value is enough */
    }
  },
  setActiveNote(note) {
    set({ activeNote: note })
  },
  setLiveBody(body) {
    set({ liveBody: body })
  }
}))

export function noteSummaryTime(n: NoteSummary): string {
  const d = new Date(n.updatedAt)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return `${t('time.today')} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export type { Note }
