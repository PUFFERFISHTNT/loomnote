import { useEffect, useRef, useState } from 'react'
import type { AgentEvent } from '@loomnote/core'
import { useApp } from '../stores/app.js'
import { locale, t, useLang } from '../i18n.js'

/** Agent 运行时面板（VCP 式）：状态灯 + 步数统计 + 流式实时输出（聚合 delta）+ 结构化工具事件时间线。 */
export function AgentRuntime() {
  const open = useApp((s) => s.agentOpen)
  const [req, setReq] = useState('')
  const busy = useApp((s) => s.busy)
  const events = useApp((s) => s.events)
  const streamText = useApp((s) => s.streamText)
  const setAgentOpen = useApp((s) => s.setAgentOpen)
  const activeNote = useApp((s) => s.activeNote)
  const bodyRef = useRef<HTMLDivElement>(null)
  useLang()

  useEffect(() => {
    // 新事件自动滚到底
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight })
  }, [events.length, streamText])

  if (!open) return null

  const steps = events.filter((e) => e.type === 'tool-start').length
  const done = events.findLast((e) => e.type === 'done')
  const err = events.findLast((e) => e.type === 'error')

  return (
    <aside className="agent-dock">
      <div className="agent-head">
        <b>
          <span className={busy ? 'dot on' : 'dot'} />
          {t('agent.title')}
        </b>
        {busy && (
          <button className="btn danger" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => void window.loomnote.cancelAgent()}>
            ■ {t('agent.stop')}
          </button>
        )}
        <button className="icon-btn" onClick={() => setAgentOpen(false)} title={t('agent.collapse')}>
          ✕
        </button>
      </div>
      <div className="agent-stats">
        <span className={busy ? 'chip blue' : 'chip gray'}>{busy ? t('agent.running') : t('agent.idle')}</span>
        <span className="chip gray">⚡ {t('agent.tools')} {steps}</span>
        {err && <span className="chip err">{t('agent.interrupted')}</span>}
        {done && !busy && <span className="chip ok">✓ {t('agent.done')}</span>}
      </div>
      <div className="req-input">
        <input
          value={req}
          placeholder={activeNote ? t('agent.placeholder.note', { title: activeNote.title }) : t('agent.placeholder.none')}
          onChange={(e) => setReq(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submitReq(setReq)
          }}
          disabled={busy}
        />
        <button className="btn primary" style={{ padding: '6px 12px' }} disabled={busy || !req.trim()} onClick={() => void submitReq(setReq)}>
          {t('agent.send')}
        </button>
      </div>
      <div className="agent-body" ref={bodyRef}>
        {streamText && (
          <div className="agent-stream">
            <div className="head">▸ {t('agent.live')}</div>
            <pre>
              {streamText.slice(-1200)}
              {busy && <span className="stream-cursor" />}
            </pre>
          </div>
        )}
        {events.map((e, i) => (
          <EventCard key={i} e={e} />
        ))}
        {!events.length && !streamText && (
          <div className="empty-state" style={{ padding: '48px 12px' }}>
            <div className="big">⚡</div>
            <b>{t('agent.empty.title')}</b>
            <span>{t('agent.empty.body')}</span>
          </div>
        )}
      </div>
    </aside>
  )
}

async function submitReq(setReq: (v: string) => void): Promise<void> {
  const app = useApp.getState()
  const text = (document.querySelector('.req-input input') as HTMLInputElement | null)?.value ?? ''
  if (!text.trim() || app.busy) return
  const note = app.activeNote
  app.setAgentOpen(true)
  app.clearRun()
  app.setBusy(true)
  try {
    const ctx = note ? t('agent.prompt.context', { title: note.title, body: note.bodyMd.slice(0, 600000) }) : t('agent.prompt.noNote')
    const res = await window.loomnote.runAgent(
      `${t('agent.prompt.task', { task: text.trim() })}\n${ctx}\n\n` + t('agent.prompt.demoRule') + t('agent.prompt.markdownRule') + t('agent.prompt.englishRule')
    )
    if (note) {
      const updated = { ...note, bodyMd: res.output, updatedAt: Date.now() }
      await window.loomnote.saveNote(updated)
      app.setActiveNote(updated)
      await app.refreshAll()
    }
    setReq('')
  } catch (e) {
    app.setError(e instanceof Error ? e.message : String(e))
  } finally {
    app.setBusy(false)
  }
}

function EventCard({ e }: { e: AgentEvent }) {
  const time = new Date().toLocaleTimeString(locale(), { hour12: false })
  useLang()
  switch (e.type) {
    case 'plan':
      return (
        <div className="evt-card">
          <div className="evt-head">
            🧭 {t('agent.task')} <span className="time">{time}</span>
          </div>
          <div className="evt-body">
            {e.plan.slice(0, 160)}
            {e.plan.length > 160 ? '…' : ''}
          </div>
        </div>
      )
    case 'tool-start':
      return (
        <div className="evt-card tool">
          <div className="evt-head">
            ⚡ {t('agent.step.tool')} <code>{e.tool}</code> <span className="time">{time}</span>
          </div>
          {Object.keys(e.args as object).length > 0 && (
            <details>
              <summary>{t('agent.step.args')}</summary>
              <div className="json">{JSON.stringify(e.args, null, 2)}</div>
            </details>
          )}
        </div>
      )
    case 'tool-result':
      return (
        <div className={`evt-card ${e.ok ? 'ok' : 'fail'}`}>
          <div className="evt-head">
            {e.ok ? '✓' : '✗'} <code>{e.tool}</code> <span className="time">{time}</span>
          </div>
          <div className="evt-body">
            {e.output.slice(0, 220)}
            {e.output.length > 220 ? '…' : ''}
          </div>
          {e.output.length > 220 && (
            <details>
              <summary>{t('agent.step.result')}</summary>
              <div className="json">{e.output.slice(0, 1500)}</div>
            </details>
          )}
        </div>
      )
    case 'checkpoint':
      return (
        <div className="evt-card">
          <div className="evt-head">
            💾 {t('agent.step.checkpoint')} #{e.step} <span className="time">{time}</span>
          </div>
        </div>
      )
    case 'done':
      return (
        <div className="evt-card ok">
          <div className="evt-head">
            🏁 {t('agent.done')} <span className="time">{time}</span>
          </div>
          <div className="evt-body">{e.output.slice(0, 300)}…</div>
        </div>
      )
    case 'error':
      return (
        <div className="evt-card error">
          <div className="evt-head">
            ⛔ {e.message} <span className="time">{time}</span>
          </div>
        </div>
      )
    default:
      return null
  }
}
