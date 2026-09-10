import { useEffect, useState } from 'react'
import { useApp } from '../stores/app.js'
import type { Settings } from '../../../shared/ipc.js'

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

  return (
    <div className="view narrow">
      <h1 className="view-title">设置</h1>
      <p className="view-sub">模型自由接入：任何 OpenAI 兼容端点都可用（火山方舟 · DeepSeek · Ollama 本地 …）。密钥只存本机。</p>

      <div className="section-title">模型</div>
      <div className="form" style={{ marginTop: 14 }}>
        <div className="presets">
          <button className={form.model === 'deepseek-v4-flash' ? 'preset-card on' : 'preset-card'} onClick={() => setForm({ ...form, model: 'deepseek-v4-flash' })}>
            <b>DeepSeek V4 Flash</b>
            <span>默认 · 文本整理 / 工具调用</span>
          </button>
          <button className={form.model === 'glm-5.3-flash' ? 'preset-card on' : 'preset-card'} onClick={() => setForm({ ...form, model: 'glm-5.3-flash' })}>
            <b>GLM 5.3 Flash</b>
            <span>视觉 / 识图（思考型）</span>
          </button>
        </div>

        <label>
          Base URL
          <input value={form.baseURL} onChange={(e) => setForm({ ...form, baseURL: e.target.value })} spellCheck={false} />
        </label>
        <label>
          API Key
          <input type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="ark-..." spellCheck={false} />
        </label>
        <label>
          模型名
          <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} spellCheck={false} />
        </label>
        <label>
          最大输出 tokens
          <input
            type="number"
            value={form.maxTokens}
            onChange={(e) => setForm({ ...form, maxTokens: Number(e.target.value) || 4096 })}
          />
          <small>思考型模型（GLM 5.3 系）需要 ≥ 512，否则内容为空；默认 4096。</small>
        </label>
      </div>

      <div className="section-title">Agent 工具</div>
      <div className="form" style={{ marginTop: 14 }}>
        <label className="row">
          <input
            type="checkbox"
            style={{ width: 16, height: 16 }}
            checked={form.webEnabled}
            onChange={(e) => setForm({ ...form, webEnabled: e.target.checked })}
          />
          允许联网（web_fetch 抓取网页查证）
        </label>
      </div>

      <div style={{ marginTop: 26, display: 'flex', gap: 10, alignItems: 'center' }}>
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
    </div>
  )
}