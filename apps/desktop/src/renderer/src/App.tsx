import { useEffect } from 'react'
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import { useApp } from './stores/app.js'
import { useChat } from './stores/chat.js'
import { t, useLang } from './i18n.js'
import { Dashboard } from './views/Dashboard.js'
import { Imports } from './views/Imports.js'
import { Notes } from './views/Notes.js'
import { Settings } from './views/Settings.js'
import { ComingSoon } from './views/ComingSoon.js'
import { ChatPanel } from './components/ChatPanel.js'
import { Toast } from './components/Toast.js'

export function App() {
  const loadSettings = useApp((s) => s.loadSettings)
  const refreshAll = useApp((s) => s.refreshAll)
  useLang()

  useEffect(() => {
    void refreshAll()
    void loadSettings()

    const offChat = window.loomnote.onChatEvent(({ noteId, event }) => {
      const app = useApp.getState()
      // Events belong to the note that produced them: a background session must
      // not paint itself into the conversation the student is reading.
      if (app.activeNote?.id && noteId !== app.activeNote.id) return
      useChat.getState().apply(event)
      if (event.type === 'turn-end' || event.type === 'status') void app.refreshAll()
    })

    const offNote = window.loomnote.onNoteLive(({ noteId, bodyMd }) => {
      const app = useApp.getState()
      if (app.activeNote?.id && noteId !== app.activeNote.id) return
      app.setLiveBody(bodyMd)
      useChat.getState().setLiveBody(bodyMd)
    })

    return () => {
      offChat()
      offNote()
    }
  }, [refreshAll, loadSettings])

  return (
    <HashRouter>
      <div className="app">
        <Sidebar />
        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/imports" element={<Imports />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/notes/:id" element={<Notes />} />
            <Route path="/review" element={<ComingSoon title={t('comingSoon.review.title')} icon="🔁" desc={t('comingSoon.review.desc')} />} />
            <Route path="/graph" element={<ComingSoon title={t('comingSoon.graph.title')} icon="🕸" desc={t('comingSoon.graph.desc')} />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
        <ChatPanel />
        <Toast />
      </div>
    </HashRouter>
  )
}

function Sidebar() {
  const health = useApp((s) => s.health)
  const chatOpen = useApp((s) => s.chatOpen)
  const collapsed = useApp((s) => s.sidebarCollapsed)
  const running = useChat((s) => s.running)
  const setChatOpen = useApp((s) => s.setChatOpen)
  const toggleSidebar = useApp((s) => s.toggleSidebar)
  useLang()

  return (
    <aside className={collapsed ? 'side collapsed' : 'side'}>
      <div className="side-head">
        <div className="side-logo">🧶</div>
        <div className="side-title">
          <b>{t('app.name')}</b>
          <span>{t('app.tagline')}</span>
        </div>
        <button
          className="side-collapse"
          onClick={toggleSidebar}
          title={collapsed ? t('nav.expand') : t('nav.collapse')}
          aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
          aria-expanded={!collapsed}
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>
      <nav>
        <NavLink to="/" end title={t('nav.workbench')}>
          <span className="ico">🏠</span> <span className="label">{t('nav.workbench')}</span>
        </NavLink>
        <NavLink to="/imports" title={t('nav.inbox')}>
          <span className="ico">📥</span> <span className="label">{t('nav.inbox')}</span>
        </NavLink>
        <NavLink to="/notes" title={t('nav.notes')}>
          <span className="ico">📝</span> <span className="label">{t('nav.notes')}</span>
        </NavLink>
        <NavLink to="/review" title={t('nav.review')}>
          <span className="ico">🔁</span> <span className="label">{t('nav.review')}</span>
        </NavLink>
        <NavLink to="/graph" title={t('nav.graph')}>
          <span className="ico">🕸</span> <span className="label">{t('nav.graph')}</span>
        </NavLink>
        <NavLink to="/settings" title={t('nav.settings')}>
          <span className="ico">⚙️</span> <span className="label">{t('nav.settings')}</span>
        </NavLink>
      </nav>
      <div className="side-foot">
        <button className="side-agent-btn" onClick={() => setChatOpen(!chatOpen)}>
          <span className="ico">⚡</span> <span className="label">{t('nav.agent')}</span>
          <span className={running ? 'pulse-dot on' : 'pulse-dot'} />
        </button>
        <div className="side-meta">
          {health ? `${health.db === 'sqlite' ? 'SQLite' : t('storage.local')} · ${t(health.noteCount === 1 ? 'storage.note.one' : 'storage.notes', { n: health.noteCount })}` : '…'}
        </div>
      </div>
    </aside>
  )
}
