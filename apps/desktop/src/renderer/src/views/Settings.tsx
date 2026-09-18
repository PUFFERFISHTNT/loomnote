import { useEffect, useState } from 'react'
import { useApp } from '../stores/app.js'
import { newProviderId, PRESET_PROVIDERS, type ProviderConfig, type Settings } from '../../../shared/ipc.js'

/** 集成与设置：多接口管理（自定义添加）+ 全局开关。 */
export function Settings() {
  const settings = useApp((s) => s.settings)
  const [form, setForm] = useState<Settings | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void useApp.getState().loadSettings()
  }, [])

  useEffect(() => {
    if (settings && !form) setForm(settings)
  }, [settings, form])

  if (!form) {
    return (
      <div className="view narrow">
        <h1 className="view-title">设置</h1>
        <p className="hint">加载中…</p>
      </div>
    )
  }

  function patchProvider(id: string, patch: Partial<ProviderConfig>) {
    if (!form) return
    const cur: Settings = form
    setForm({ ...cur, providers: cur.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
  }

  function addProvider() {
    if (!form) return
    const cur: Settings = form
    const name = '自定义接口'
    const p: ProviderConfig = { id: newProviderId(name), name, baseURL: 'https://api.example.com/v1', apiKey: '', model: 'your-model', maxTokens: 4096 }
    setForm({ ...cur, providers: [...cur.providers, p], activeProviderId: cur.providers.length === 0 ? p.id : cur.activeProviderId })
  }

  function removeProvider(id: string) {
    if (!form || form.providers.length <= 1) return
    const cur: Settings = form
    const providers = cur.providers.filter((p) => p.id !== id)
    setForm({ ...cur, providers, activeProviderId: cur.activeProviderId === id ? providers[0]!.id : cur.activeProviderId })
  }

  return (
    <div className="view" style={{ maxWidth: 860 }}>
      <h1 className="view-title">设置</h1>
      <p className="view-sub">模型接口自由接入：内置 DeepSeek 官方 / 火山方舟 / Ollama 预设，也可添加任意 OpenAI 兼容端点。密钥只存本机。</p>

      <div className="section-title">接口列表（点选左侧圆圈设为当前使用）</div>
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
                title="设为当前接口"
                onClick={() => setForm({ ...form, activeProviderId: p.id })}
              />
              <input
                style={{ fontWeight: 600, fontSize: 14, border: 'none', outline: 'none', background: 'transparent', flex: 1, userSelect: 'text', color: 'var(--text)' }}
                value={p.name}
                onChange={(e) => patchProvider(p.id, { name: e.target.value })}
                spellCheck={false}
              />
              {p.id === 'deepseek-official' && <span className="chip blue">DeepSeek 官方</span>}
              {p.id === form.activeProviderId && <span className="chip ok">✓ 当前使用</span>}
              <button className="btn ghost" style={{ padding: '3px 8px', color: 'var(--err)' }} onClick={() => removeProvider(p.id)} title="删除此接口">
                ✕
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                Base URL
                <input style={inputStyle} value={p.baseURL} onChange={(e) => patchProvider(p.id, { baseURL: e.target.value })} spellCheck={false} />
              </label>
              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                模型名
                <input style={inputStyle} value={p.model} onChange={(e) => patchProvider(p.id, { model: e.target.value })} spellCheck={false} />
              </label>
              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                API Key
                <input style={inputStyle} type="password" value={p.apiKey} onChange={(e) => patchProvider(p.id, { apiKey: e.target.value })} placeholder="sk-..." spellCheck={false} />
              </label>
              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                最大输出 tokens
                <input style={inputStyle} type="number" value={p.maxTokens} onChange={(e) => patchProvider(p.id, { maxTokens: Number(e.target.value) || 4096 })} />
              </label>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn" onClick={addProvider}>
          + 添加自定义接口
        </button>
        <span className="hint">或从预设补回：</span>
        {PRESET_PROVIDERS.filter((pre) => !form.providers.some((p) => p.id === pre.id)).map((pre) => (
          <button key={pre.id} className="btn ghost" onClick={() => setForm({ ...form, providers: [...form.providers, { ...pre, apiKey: '' }] })}>
            添加 {pre.name}
          </button>
        ))}
      </div>

      <div className="section-title">Agent 工具</div>
      <div style={{ marginTop: 12 }}>
        <label className="row" style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 500, fontSize: 13.5 }}>
          <input type="checkbox" style={{ width: 16, height: 16 }} checked={form.webEnabled} onChange={(e) => setForm({ ...form, webEnabled: e.target.checked })} />
          允许联网（web_fetch 抓取网页查证）
        </label>
      </div>

      <div style={{ marginTop: 24, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          className="btn primary"
          onClick={async () => {
            const next = await window.loomnote.setSettings(form)
            setForm(next)
            await useApp.getState().loadSettings()
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)
          }}
        >
          保存设置
        </button>
        {saved && <span className="chip ok">✓ 已保存</span>}
      </div>
      <p className="hint" style={{ marginTop: 16 }}>
        提示：DeepSeek 官方 API 使用 <code>deepseek-chat</code>（可改为 deepseek-reasoner）；火山方舟 Coding Plan 需使用 /api/coding/v3 端点（勿用按量计费的 /api/v3）；GLM 5.3 为思考型视觉模型，maxTokens ≥ 512 否则输出为空。
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