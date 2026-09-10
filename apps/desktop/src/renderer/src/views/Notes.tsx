import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Note } from '@loomnote/core'
import { renderMarkdown, hydrateMarkdown } from '../render/markdown.js'
import { DemoSandbox } from '../components/DemoSandbox.js'
import { noteSummaryTime, useApp } from '../stores/app.js'

type Mode = 'body' | 'source' | 'demo'

export function Notes() {
  const notes = useApp((s) => s.notes)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [note, setNote] = useState<Note | null>(null)
  const [mode, setMode] = useState<Mode>('body')
  const [draft, setDraft] = useState('')
  const [dirty, setDirty] = useState(false)
  const [demoHtml, setDemoHtml] = useState('')
  const [liveHtml, setLiveHtml] = useState('')
  const busy = useApp((s) => s.busy)
  const streamText = useApp((s) => s.streamText)
  const bodyRef = useRef<HTMLDivElement>(null)
  const inlineRoots = useRef<Array<{ root: ReturnType<typeof createRoot> }>>([])

  useEffect(() => {
    void useApp.getState().refreshAll()
  }, [])

  // 唯一笔记自动选中（截图/新用户友好）
  useEffect(() => {
    if (!currentId && notes.length === 1) setCurrentId(notes[0]!.id)
  }, [notes, currentId])

  useEffect(() => {
    if (!currentId) return
    void window.loomnote.getNote(currentId).then((n) => {
      if (n) {
        setNote(n)
        setDraft(n.bodyMd)
        setDirty(false)
        setDemoHtml('')
        useApp.getState().setActiveNote(n)
      }
    })
  }, [currentId])

  useEffect(() => {
    if (mode !== 'body' || !bodyRef.current || !note) return
    const { html, demos } = renderMarkdown(note.bodyMd)
    bodyRef.current.innerHTML = html
    void hydrateMarkdown(bodyRef.current).catch(() => undefined)
    // md+html 混合渲染：:::demo 提取的 HTML 挂载为内嵌沙箱
    inlineRoots.current.forEach((r) => r.root.unmount())
    inlineRoots.current = []
    const nodes = bodyRef.current.querySelectorAll<HTMLElement>('[data-demo-idx]')
    nodes.forEach((el) => {
      const idx = Number(el.getAttribute('data-demo-idx'))
      const title = el.getAttribute('data-demo-title') ?? '内嵌演示'
      const root = createRoot(el)
      root.render(<DemoSandbox html={demos[idx] ?? ''} title={title} compact />)
      inlineRoots.current.push({ root })
    })
    return () => {
      inlineRoots.current.forEach((r) => r.root.unmount())
      inlineRoots.current = []
    }
  }, [mode, note])

  // 实时渲染：agent 流式输出 → 防抖 250ms → markdown 实时预览（看笔记边写边长）
  useEffect(() => {
    if (!busy || !streamText) {
      setLiveHtml('')
      return
    }
    const t = setTimeout(() => {
      setLiveHtml(renderMarkdown(streamText).html)
    }, 250)
    return () => clearTimeout(t)
  }, [streamText, busy])

  async function save() {
    if (!note) return
    const updated: Note = { ...note, bodyMd: draft, updatedAt: Date.now() }
    await window.loomnote.saveNote(updated)
    setNote(updated)
    setDirty(false)
    await useApp.getState().refreshAll()
  }

  async function organize() {
    if (!note || busy) return
    if (!confirm(`AI 将重新整理《${note.title}》并覆盖正文内容，继续？`)) return
    const app = useApp.getState()
    app.setAgentOpen(true)
    app.clearRun()
    app.setBusy(true)
    try {
      const res = await window.loomnote.runAgent(
        `请整理以下笔记为结构化学习笔记（主标题/:::toc 目录/章节/速记卡/自测题），并保留原文关键信息：\n\n${note.bodyMd.slice(0, 6000)}`
      )
      const updated: Note = { ...note, bodyMd: res.output, updatedAt: Date.now() }
      await window.loomnote.saveNote(updated)
      setNote(updated)
      setDraft(res.output)
      setDirty(false)
      setMode('body')
      app.setActiveNote(updated)
      await app.refreshAll()
    } catch (e) {
      app.setError(e instanceof Error ? e.message : String(e))
    } finally {
      app.setBusy(false)
    }
  }

  async function generateDemo() {
    if (!note || busy) return
    const app = useApp.getState()
    app.setAgentOpen(true)
    app.clearRun()
    app.setBusy(true)
    setDemoHtml('')
    setMode('demo')
    try {
      const res = await window.loomnote.runAgent(
        `为一个学习知识点生成一个自包含的 HTML5 交互演示（可点击分步、纯内联样式与脚本、不引用任何外部资源、单根容器 div）：${note.title}\n\n背景：${note.bodyMd.slice(0, 2500)}`
      )
      setDemoHtml(res.output)
    } catch (e) {
      app.setError(e instanceof Error ? e.message : String(e))
    } finally {
      app.setBusy(false)
    }
  }

  return (
    <div className="workbench">
      <aside className="pane-side">
        <h3>
          全部笔记 <span style={{ color: 'var(--text3)', fontWeight: 400 }}>{notes.length}</span>
        </h3>
        <ul className="note-list">
          {notes.map((n) => (
            <li key={n.id} className={n.id === currentId ? 'active' : ''} onClick={() => setCurrentId(n.id)}>
              <span>📄</span>
              <span className="t">
                <b>{n.title}</b>
                <span>{noteSummaryTime(n)}</span>
              </span>
            </li>
          ))}
          {notes.length === 0 && (
            <li style={{ cursor: 'default', color: 'var(--text3)' }}>
              <span>📭</span>
              <span className="t">
                <b>还没有笔记</b>
                <span>去资料箱导入一份</span>
              </span>
            </li>
          )}
        </ul>
      </aside>

      <section className="pane-main">
        {note ? (
          <>
            <div className="note-toolbar">
              <div className="crumb">
                <span style={{ color: 'var(--text3)' }}>笔记</span>
                <span style={{ color: 'var(--text3)' }}>/</span>
                <b>{note.title}</b>
                <span className={dirty ? 'save-chip dirty' : 'save-chip'}>{dirty ? '● 未保存' : '✓ 已保存'}</span>
              </div>
              <div className="tabs">
                <button className={mode === 'body' ? 'active' : ''} onClick={() => setMode('body')}>
                  正文
                </button>
                <button className={mode === 'demo' ? 'active' : ''} onClick={() => setMode('demo')}>
                  演示
                </button>
                <button className={mode === 'source' ? 'active' : ''} onClick={() => setMode('source')}>
                  源码
                </button>
              </div>
              <button className="btn" disabled={busy} onClick={() => void generateDemo()}>
                🎬 AI 生成演示
              </button>
              <button className="btn primary" disabled={busy} onClick={() => void organize()}>
                {busy ? <span className="spinner" /> : '✨'} AI 整理
              </button>
            </div>

            <div className="note-body">
              {busy && liveHtml && (
                <div className="live-preview">
                  <div className="live-badge">
                    <span className="spinner" />
                    AI 正在生成 · 实时预览（可在右侧面板随时提需求或停止）
                  </div>
                  <div className="md" dangerouslySetInnerHTML={{ __html: liveHtml }} />
                </div>
              )}
              {mode === 'body' && <div ref={bodyRef} className="md" />}
              {mode === 'source' && (
                <div className="source-wrap">
                  <textarea
                    className="source-editor"
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value)
                      setDirty(true)
                    }}
                    spellCheck={false}
                  />
                  <div className="source-bar">
                    <button className="btn" onClick={() => { setDraft(note.bodyMd); setDirty(false) }}>
                      撤销修改
                    </button>
                    <button className="btn primary" disabled={!dirty} onClick={() => void save()}>
                      保存
                    </button>
                  </div>
                </div>
              )}
              {mode === 'demo' && (
                <div className="demo-pane">
                  {demoHtml ? (
                    <DemoSandbox html={demoHtml} title={`${note.title} · 交互演示`} />
                  ) : (
                    <div className="empty-state" style={{ paddingTop: 120 }}>
                      <div className="big">🎬</div>
                      <b>{busy ? 'Agent 正在生成交互演示…' : '这篇笔记还没有演示'}</b>
                      <span>点上方「AI 生成演示」，agent 会为知识点生成分步动画 HTML，在安全沙箱内渲染（外联 = 0，数据不出本机）。</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="empty-state" style={{ paddingTop: '18vh' }}>
            <div className="big">📝</div>
            <b>选择左侧一篇笔记开始</b>
            <span>或到「资料箱」导入 PDF / Markdown，让 agent 把它整理成学习笔记。</span>
          </div>
        )}
      </section>
    </div>
  )
}