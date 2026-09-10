import { useEffect, useRef, useState } from 'react'
import type { AgentEvent } from '@loomnote/core'
import { useApp } from '../stores/app.js'

/** Agent 运行时面板（VCP 式）：状态灯 + 步数统计 + 流式实时输出（聚合 delta）+ 结构化工具事件时间线。 */
export function AgentRuntime() {
  const open = useApp((s) => s.agentOpen)
  const [req, setReq] = useState('')
  const busy = useApp((s) => s.busy)
  const events = useApp((s) => s.events)
  const streamText = useApp((s) => s.streamText)
  const setAgentOpen = useApp((s) => s.setAgentOpen)
  const bodyRef = useRef<HTMLDivElement>(null)

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
          Agent 运行时
        </b>
        {busy && (
          <button className="btn danger" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => void window.loomnote.cancelAgent()}>
            ■ 停止
          </button>
        )}
        <button className="icon-btn" onClick={() => setAgentOpen(false)} title="收起面板">
          ✕
        </button>
      </div>
      <div className="agent-stats">
        <span className={busy ? 'chip blue' : 'chip gray'}>{busy ? '运行中' : '空闲'}</span>
        <span className="chip gray">⚡ 工具 {steps}</span>
        {err && <span className="chip err">已中断</span>}
        {done && !busy && <span className="chip ok">✓ 完成</span>}
      </div>
      <div className="req-input">
        <input
          value={req}
          placeholder={useApp.getState().activeNote ? '对 agent 提需求，如「给排队问题加个动画演示」…' : '打开一篇笔记后即可对 agent 提需求…'}
          onChange={(e) => setReq(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submitReq(setReq)
          }}
          disabled={busy}
        />
        <button className="btn primary" style={{ padding: '6px 12px' }} disabled={busy || !req.trim()} onClick={() => void submitReq(setReq)}>
          发送
        </button>
      </div>
      <div className="agent-body" ref={bodyRef}>
        {streamText && (
          <div className="agent-stream">
            <div className="head">▸ 实时输出</div>
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
            <b>Agent 还没有运行</b>
            <span>在笔记工作区点「AI 整理」或「AI 生成演示」——它的每一步思考、每次工具调用和流式输出都会实时出现在这里。</span>
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
    const ctx = note ? `当前笔记《${note.title}》内容：\n${note.bodyMd.slice(0, 4500)}` : '（尚未打开笔记）'
    const res = await window.loomnote.runAgent(
      `用户需求：${text.trim()}\n\n${ctx}\n\n请输出更新后的完整 Markdown 笔记。要求：` +
        `在概念适合可视化或用户着重要求的位置，插入演示块（格式：单独一行 :::demo 演示标题，接着完整自包含 HTML（内联样式与脚本、不引用外部资源、单根 div），最后单独一行 ::: 收束）。` +
        `其余内容用正常 Markdown（公式用 $$）。直接输出最终结果。`
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
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  switch (e.type) {
    case 'plan':
      return (
        <div className="evt-card">
          <div className="evt-head">
            🧭 任务 <span className="time">{time}</span>
          </div>
          <div className="evt-body">{e.plan.slice(0, 160)}{e.plan.length > 160 ? '…' : ''}</div>
        </div>
      )
    case 'tool-start':
      return (
        <div className="evt-card tool">
          <div className="evt-head">
            ⚡ 调用工具 <code>{e.tool}</code> <span className="time">{time}</span>
          </div>
          {Object.keys(e.args as object).length > 0 && (
            <details>
              <summary>参数</summary>
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
          <div className="evt-body">{e.output.slice(0, 220)}{e.output.length > 220 ? '…' : ''}</div>
          {e.output.length > 220 && (
            <details>
              <summary>完整结果</summary>
              <div className="json">{e.output.slice(0, 1500)}</div>
            </details>
          )}
        </div>
      )
    case 'checkpoint':
      return (
        <div className="evt-card">
          <div className="evt-head">
            💾 检查点 #{e.step} <span className="time">{time}</span>
          </div>
        </div>
      )
    case 'done':
      return (
        <div className="evt-card ok">
          <div className="evt-head">
            🏁 完成 <span className="time">{time}</span>
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