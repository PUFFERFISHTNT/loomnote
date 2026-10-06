import { useEffect } from 'react'
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import { useApp } from './stores/app.js'
import { t, useLang } from './i18n.js'
import { Dashboard } from './views/Dashboard.js'
import { Imports } from './views/Imports.js'
import { Notes } from './views/Notes.js'
import { Settings } from './views/Settings.js'
import { ComingSoon } from './views/ComingSoon.js'
import { AgentRuntime } from './components/AgentRuntime.js'
import { Toast } from './components/Toast.js'

export function App() {
  const loadSettings = useApp((s) => s.loadSettings)
  const refreshAll = useApp((s) => s.refreshAll)
  const pushAgentEvent = useApp((s) => s.pushAgentEvent)
  useLang()

  useEffect(() => {
    void refreshAll()
    void loadSettings()
    return window.loomnote.onAgentEvent((e) => pushAgentEvent(e))
  }, [refreshAll, loadSettings, pushAgentEvent])

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
        <AgentRuntime />
        <Toast />
      </div>
    </HashRouter>
  )
}

function Sidebar() {
  const health = useApp((s) => s.health)
  const busy = useApp((s) => s.busy)
  const agentOpen = useApp((s) => s.agentOpen)
  const setAgentOpen = useApp((s) => s.setAgentOpen)
  useLang()

  return (
    <aside className="side">
      <div className="side-head">
        <div className="side-logo">🧶</div>
        <div>
          <b>{t('app.name')}</b>
          <span>{t('app.tagline')}</span>
        </div>
      </div>
      <nav>
        <NavLink to="/" end>
          <span className="ico">🏠</span> {t('nav.workbench')}
        </NavLink>
        <NavLink to="/imports">
          <span className="ico">📥</span> {t('nav.inbox')}
        </NavLink>
        <NavLink to="/notes">
          <span className="ico">📝</span> {t('nav.notes')}
        </NavLink>
        <NavLink to="/review">
          <span className="ico">🔁</span> {t('nav.review')}
        </NavLink>
        <NavLink to="/graph">
          <span className="ico">🕸</span> {t('nav.graph')}
        </NavLink>
        <NavLink to="/settings">
          <span className="ico">⚙️</span> {t('nav.settings')}
        </NavLink>
      </nav>
      <div className="side-foot">
        <button className="side-agent-btn" onClick={() => setAgentOpen(!agentOpen)}>
          <span className="ico">⚡</span> {t('nav.agent')}
          <span className={busy ? 'pulse-dot on' : 'pulse-dot'} />
        </button>
        <div className="side-meta">{health ? `${health.db === 'sqlite' ? 'SQLite' : t('storage.local')} · ${t(health.noteCount === 1 ? 'storage.note.one' : 'storage.notes', { n: health.noteCount })}` : '…'}</div>
      </div>
    </aside>
  )
}
