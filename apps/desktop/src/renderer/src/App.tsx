import { useEffect } from 'react'
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import { useApp } from './stores/app.js'
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
            <Route path="/review" element={<ComingSoon title="复习中心" icon="🔁" desc="抽认卡、FSRS 间隔重复与错题归因将在 M4 上线。AI 整理出的自测题此刻已随笔记生成。" />} />
            <Route path="/graph" element={<ComingSoon title="知识图谱" icon="🕸" desc="力导向画布、增量合并 Diff 与 MOC 地图将在 M3 上线。双链语法 [[知识点]] 已可在笔记中使用。" />} />
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

  return (
    <aside className="side">
      <div className="side-head">
        <div className="side-logo">🧶</div>
        <div>
          <b>织记</b>
          <span>LoomNote</span>
        </div>
      </div>
      <nav>
        <NavLink to="/" end>
          <span className="ico">🏠</span> 工作台
        </NavLink>
        <NavLink to="/imports">
          <span className="ico">📥</span> 资料箱
        </NavLink>
        <NavLink to="/notes">
          <span className="ico">📝</span> 笔记工作区
        </NavLink>
        <NavLink to="/review">
          <span className="ico">🔁</span> 复习中心
        </NavLink>
        <NavLink to="/graph">
          <span className="ico">🕸</span> 知识图谱
        </NavLink>
        <NavLink to="/settings">
          <span className="ico">⚙️</span> 设置
        </NavLink>
      </nav>
      <div className="side-foot">
        <button className="side-agent-btn" onClick={() => setAgentOpen(!agentOpen)}>
          <span className="ico">⚡</span> Agent 运行时
          <span className={busy ? 'pulse-dot on' : 'pulse-dot'} />
        </button>
        <div className="side-meta">{health ? `${health.db === 'sqlite' ? 'SQLite' : '本地 JSON'} · ${health.noteCount} 篇笔记` : '…'}</div>
      </div>
    </aside>
  )
}