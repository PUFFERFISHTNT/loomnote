import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { noteSummaryTime, useApp } from '../stores/app.js'
import { locale, providerLabel, t, useLang } from '../i18n.js'

export function Dashboard() {
  const h = useApp((s) => s.health)
  const notes = useApp((s) => s.notes)
  const imports = useApp((s) => s.imports)
  const events = useApp((s) => s.events)
  const settings = useApp((s) => s.settings)
  const navigate = useNavigate()
  useLang()

  useEffect(() => {
    void useApp.getState().refreshAll()
    void useApp.getState().loadSettings()
  }, [])

  const hour = new Date().getHours()
  const greet = hour < 5 ? t('dash.greet.night') : hour < 12 ? t('dash.greet.morning') : hour < 18 ? t('dash.greet.afternoon') : t('dash.greet.evening')
  const activeProvider = settings?.providers?.find((p) => p.id === settings.activeProviderId)

  return (
    <div className="view">
      <div className="dash-hero">
        <h1>
          {greet}
          {t('dash.welcome')}
        </h1>
        <p>
          {new Date().toLocaleDateString(locale(), { month: 'long', day: 'numeric', weekday: 'long' })}
          {activeProvider ? ` · ${t('dash.model')} ${providerLabel(activeProvider)}` : ''}
        </p>
      </div>

      <div className="stat-row">
        <div className="stat-card">
          <b>{notes.length}</b>
          <span>{t('dash.stat.notes')}</span>
        </div>
        <div className="stat-card">
          <b>{imports.length}</b>
          <span>{t('dash.stat.imports')}</span>
        </div>
        <div className="stat-card">
          <b>{h ? (h.db === 'sqlite' ? 'SQLite' : 'JSON') : '…'}</b>
          <span>{t('dash.stat.storage', { state: h?.ok ? t('dash.stat.healthy') : '—' })}</span>
        </div>
        <div className="stat-card">
          <b>{events.length}</b>
          <span>{t('dash.stat.events')}</span>
        </div>
      </div>

      <div className="dash-actions">
        <button className="btn primary" onClick={() => navigate('/imports')}>
          📥 {t('dash.action.import')}
        </button>
        <button className="btn" onClick={() => navigate('/notes')} disabled={notes.length === 0}>
          🪄 {t('dash.action.organise')}
        </button>
      </div>

      {notes.length > 0 && (
        <>
          <div className="section-title">{t('dash.recent')}</div>
          <div className="recent-list" style={{ marginTop: 10 }}>
            {notes.slice(0, 6).map((n) => (
              <button key={n.id} className="recent-item" onClick={() => navigate('/notes')}>
                <span className="ico">📄</span>
                <span className="t">
                  <b>{n.title}</b>
                  <span>
                    {noteSummaryTime(n)} {t('dash.updated')}
                  </span>
                </span>
                <span className="chip gray">{t('dash.open')} →</span>
              </button>
            ))}
          </div>
        </>
      )}

      {notes.length === 0 && (
        <div className="empty-state">
          <div className="big">🌱</div>
          <b>{t('dash.empty.title')}</b>
          <span>{t('dash.empty.body')}</span>
        </div>
      )}
    </div>
  )
}
