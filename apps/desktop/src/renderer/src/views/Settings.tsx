import { useEffect, useState } from 'react'
import { useApp } from '../stores/app.js'
import { newProviderId, PRESET_PROVIDERS, type ProviderConfig, type Settings as SettingsShape } from '../../../shared/ipc.js'
import { getLang, providerLabel, t, useLang } from '../i18n.js'

/** 集成与设置：多接口管理（自定义添加）+ 界面语言 + 全局开关。 */
export function Settings() {
  const settings = useApp((s) => s.settings)
  const [form, setForm] = useState<SettingsShape | null>(null)
  const [saved, setSaved] = useState(false)
  const lang = useLang()

  useEffect(() => {
    void useApp.getState().loadSettings()
  }, [])

  useEffect(() => {
    if (settings && !form) setForm(settings)
  }, [settings, form])

  if (!form) {
    return (
      <div className="view narrow">
        <h1 className="view-title">{t('settings.title')}</h1>
        <p className="hint">{t('common.loading')}</p>
      </div>
    )
  }

  function patchProvider(id: string, patch: Partial<ProviderConfig>) {
    if (!form) return
    const cur: SettingsShape = form
    setForm({ ...cur, providers: cur.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
  }

  function addProvider() {
    if (!form) return
    const cur: SettingsShape = form
    const name = t('settings.custom')
    const p: ProviderConfig = { id: newProviderId(name), name, baseURL: 'https://api.example.com/v1', apiKey: '', model: 'your-model', maxTokens: 4096 }
    setForm({ ...cur, providers: [...cur.providers, p], activeProviderId: cur.providers.length === 0 ? p.id : cur.activeProviderId })
  }

  function removeProvider(id: string) {
    if (!form || form.providers.length <= 1) return
    const cur: SettingsShape = form
    const providers = cur.providers.filter((p) => p.id !== id)
    setForm({ ...cur, providers, activeProviderId: cur.activeProviderId === id ? providers[0]!.id : cur.activeProviderId })
  }

  /** Preset names follow the interface language until the user renames one. */
  function shownName(p: ProviderConfig): string {
    const presetName = PRESET_PROVIDERS.find((x) => x.id === p.id)?.name
    return presetName && p.name === presetName ? providerLabel(p) : p.name
  }

  return (
    <div className="view" style={{ maxWidth: 860 }}>
      <h1 className="view-title">{t('settings.title')}</h1>
      <p className="view-sub">{t('settings.sub')}</p>

      <div className="section-title">{t('settings.language')}</div>
      <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className={lang === 'zh' ? 'btn primary' : 'btn'} onClick={() => void useApp.getState().setLang('zh')}>
          中文
        </button>
        <button className={lang === 'en' ? 'btn primary' : 'btn'} onClick={() => void useApp.getState().setLang('en')}>
          English
        </button>
        <span className="hint">{t('settings.language.hint')}</span>
      </div>

      <div className="section-title" style={{ marginTop: 24 }}>
        {t('settings.list')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
        {form.providers.map((p) => (
          <div
            key={p.id}
            style={{
              border: p.id === form.activeProviderId ? '1px solid var(--accent)' : '1px solid var(--line2)',
              borderRadius: 'var(--radius-lg)',
              background: '#fff',
              padding: '14px 16px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <button
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  border: '2px solid var(--line2)',
                  background: p.id === form.activeProviderId ? 'var(--accent)' : '#fff',
                  cursor: 'pointer',
                  flexShrink: 0
                }}
                title={t('settings.makeActive')}
                onClick={() => setForm({ ...form, activeProviderId: p.id })}
              />
              <input
                style={{ fontWeight: 600, fontSize: 14, border: 'none', outline: 'none', background: 'transparent', flex: 1, userSelect: 'text', color: 'var(--text)' }}
                value={shownName(p)}
                onChange={(e) => patchProvider(p.id, { name: e.target.value })}
                spellCheck={false}
              />
              {p.id === 'deepseek-official' && <span className="chip blue">{t('preset.deepseek-official')}</span>}
              {p.id === form.activeProviderId && <span className="chip ok">✓ {t('settings.inUse')}</span>}
              <button className="btn ghost" style={{ padding: '3px 8px', color: 'var(--err)' }} onClick={() => removeProvider(p.id)} title={t('settings.remove')}>
                ✕
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                Base URL
                <input style={inputStyle} value={p.baseURL} onChange={(e) => patchProvider(p.id, { baseURL: e.target.value })} spellCheck={false} />
              </label>
              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {t('settings.model')}
                <input style={inputStyle} value={p.model} onChange={(e) => patchProvider(p.id, { model: e.target.value })} spellCheck={false} />
              </label>
              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                API Key
                <input style={inputStyle} type="password" value={p.apiKey} onChange={(e) => patchProvider(p.id, { apiKey: e.target.value })} placeholder="sk-..." spellCheck={false} />
              </label>
              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {t('settings.maxTokens')}
                <input style={inputStyle} type="number" value={p.maxTokens} onChange={(e) => patchProvider(p.id, { maxTokens: Number(e.target.value) || 4096 })} />
              </label>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn" onClick={addProvider}>
          + {t('settings.addCustom')}
        </button>
        <span className="hint">{t('settings.orPreset')}</span>
        {PRESET_PROVIDERS.filter((pre) => !form.providers.some((p) => p.id === pre.id)).map((pre) => (
          <button key={pre.id} className="btn ghost" onClick={() => setForm({ ...form, providers: [...form.providers, { ...pre, apiKey: '' }] })}>
            {t('settings.add')} {providerLabel(pre)}
          </button>
        ))}
      </div>

      <div className="section-title">{t('settings.agentTools')}</div>
      <div style={{ marginTop: 12 }}>
        <label className="row" style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 500, fontSize: 13.5 }}>
          <input type="checkbox" style={{ width: 16, height: 16 }} checked={form.webEnabled} onChange={(e) => setForm({ ...form, webEnabled: e.target.checked })} />
          {t('settings.web')}
        </label>
      </div>

      <div style={{ marginTop: 24, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          className="btn primary"
          onClick={async () => {
            const next = await window.loomnote.setSettings({ ...form, lang: getLang() })
            setForm(next)
            await useApp.getState().loadSettings()
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)
          }}
        >
          {t('settings.save')}
        </button>
        {saved && <span className="chip ok">✓ {t('settings.saved')}</span>}
      </div>
      <p className="hint" style={{ marginTop: 16 }}>
        {t('settings.hint')}
      </p>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  fontFamily: 'inherit',
  fontSize: 13,
  padding: '6px 10px',
  border: '1px solid var(--line2)',
  borderRadius: 6,
  background: 'var(--bg-input)',
  color: 'var(--text)',
  outline: 'none',
  userSelect: 'text'
}
