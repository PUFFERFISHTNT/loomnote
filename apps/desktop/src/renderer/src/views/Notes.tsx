import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Note } from '@loomnote/core'
import { renderMarkdown, hydrateMarkdown } from '../render/markdown.js'
import { DemoSandbox } from '../components/DemoSandbox.js'
import { noteSummaryTime, useApp } from '../stores/app.js'
import { t, useLang } from '../i18n.js'

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
  useLang()

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
      const title = el.getAttribute('data-demo-title') ?? t('notes.embedded.demo')
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
    const timer = setTimeout(() => {
      setLiveHtml(renderMarkdown(streamText).html)
    }, 250)
    return () => clearTimeout(timer)
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
    if (!confirm(t('notes.confirm.reorganise', { title: note.title }))) return
    const app = useApp.getState()
    app.setAgentOpen(true)
    app.clearRun()
    app.setBusy(true)
    try {
      const res = await window.loomnote.runAgent(t('notes.prompt.organise', { body: note.bodyMd.slice(0, 600000) }))
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
      const res = await window.loomnote.runAgent(t('notes.prompt.demo', { body: `${note.title}\n\n${note.bodyMd.slice(0, 250000)}` }))
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
          {t('notes.all')} <span style={{ color: 'var(--text3)', fontWeight: 400 }}>{notes.length}</span>
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
                <b>{t('notes.empty')}</b>
                <span>{t('notes.empty.action')}</span>
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
                <span style={{ color: 'var(--text3)' }}>{t('notes.breadcrumb')}</span>
                <span style={{ color: 'var(--text3)' }}>/</span>
                <b>{note.title}</b>
                <span className={dirty ? 'save-chip dirty' : 'save-chip'}>
                  {dirty ? `● ${t('notes.unsaved')}` : `✓ ${t('notes.saved')}`}
                </span>
              </div>
              <div className="tabs">
                <button className={mode === 'body' ? 'active' : ''} onClick={() => setMode('body')}>
                  {t('notes.tab.read')}
                </button>
                <button className={mode === 'demo' ? 'active' : ''} onClick={() => setMode('demo')}>
                  {t('notes.tab.demo')}
                </button>
                <button className={mode === 'source' ? 'active' : ''} onClick={() => setMode('source')}>
                  {t('notes.tab.source')}
                </button>
              </div>
              <button className="btn" disabled={busy} onClick={() => void generateDemo()}>
                🎬 {t('notes.ai.demo')}
              </button>
              <button className="btn primary" disabled={busy} onClick={() => void organize()}>
                {busy ? <span className="spinner" /> : '✨'} {t('notes.ai.organise')}
              </button>
            </div>

            <div className="note-body">
              {busy && liveHtml && (
                <div className="live-preview">
                  <div className="live-badge">
                    <span className="spinner" />
                    {t('notes.generating')}
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
                    <button
                      className="btn"
                      onClick={() => {
                        setDraft(note.bodyMd)
                        setDirty(false)
                      }}
                    >
                      {t('notes.revert')}
                    </button>
                    <button className="btn primary" disabled={!dirty} onClick={() => void save()}>
                      {t('notes.save')}
                    </button>
                  </div>
                </div>
              )}
              {mode === 'demo' && (
                <div className="demo-pane">
                  {demoHtml ? (
                    <DemoSandbox html={demoHtml} title={`${note.title} · ${t('demo.interactive')}`} />
                  ) : (
                    <div className="empty-state" style={{ paddingTop: 120 }}>
                      <div className="big">🎬</div>
                      <b>{busy ? t('notes.demo.generating') : t('notes.demo.none')}</b>
                      <span>{t('notes.demo.hint')}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="empty-state" style={{ paddingTop: '18vh' }}>
            <div className="big">📝</div>
            <b>{t('notes.placeholder.title')}</b>
            <span>{t('notes.placeholder.body')}</span>
          </div>
        )}
      </section>
    </div>
  )
}
