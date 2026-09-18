import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { noteSummaryTime, useApp } from '../stores/app.js'

export function Dashboard() {
  const h = useApp((s) => s.health)
  const notes = useApp((s) => s.notes)
  const imports = useApp((s) => s.imports)
  const events = useApp((s) => s.events)
  const settings = useApp((s) => s.settings)
  const navigate = useNavigate()

  useEffect(() => {
    void useApp.getState().refreshAll()
    void useApp.getState().loadSettings()
  }, [])

  const hour = new Date().getHours()
  const greet = hour < 5 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好'

  return (
    <div className="view">
      <div className="dash-hero">
        <h1>{greet}，欢迎回来</h1>
        <p>
          {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
          {settings?.providers?.length ? ` · 接口 ${settings.providers.find((p) => p.id === settings.activeProviderId)?.name ?? '—'}` : ''}
        </p>
      </div>

      <div className="stat-row">
        <div className="stat-card">
          <b>{notes.length}</b>
          <span>笔记</span>
        </div>
        <div className="stat-card">
          <b>{imports.length}</b>
          <span>导入资料</span>
        </div>
        <div className="stat-card">
          <b>{h ? (h.db === 'sqlite' ? 'SQLite' : 'JSON') : '…'}</b>
          <span>本地存储 · {h?.ok ? '健康' : '—'}</span>
        </div>
        <div className="stat-card">
          <b>{events.length}</b>
          <span>Agent 事件（本次会话）</span>
        </div>
      </div>

      <div className="dash-actions">
        <button className="btn primary" onClick={() => navigate('/imports')}>
          📥 导入资料
        </button>
        <button className="btn" onClick={() => navigate('/notes')} disabled={notes.length === 0}>
          🪄 去整理笔记
        </button>
      </div>

      {notes.length > 0 && (
        <>
          <div className="section-title">最近笔记</div>
          <div className="recent-list" style={{ marginTop: 10 }}>
            {notes.slice(0, 6).map((n) => (
              <button key={n.id} className="recent-item" onClick={() => navigate('/notes')}>
                <span className="ico">📄</span>
                <span className="t">
                  <b>{n.title}</b>
                  <span>{noteSummaryTime(n)} 更新</span>
                </span>
                <span className="chip gray">打开 →</span>
              </button>
            ))}
          </div>
        </>
      )}

      {notes.length === 0 && (
        <div className="empty-state">
          <div className="big">🌱</div>
          <b>还没有任何笔记</b>
          <span>把一份讲义 PDF 或 Markdown 拖进「资料箱」，织记的 agent 会把它整理成带公式、演示和自测题的学习笔记。</span>
        </div>
      )}
    </div>
  )
}