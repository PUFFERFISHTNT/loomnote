import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Note } from '@loomnote/core'
import type { NoteSourceInfo } from '../../../shared/ipc.js'
import { renderMarkdown, hydrateMarkdown } from '../render/markdown.js'
import { exportPages } from '../render/pages.js'
import { DemoSandbox } from '../components/DemoSandbox.js'
import { PdfViewer } from '../components/PdfViewer.js'
import { noteSummaryTime, useApp } from '../stores/app.js'
import { useChat } from '../stores/chat.js'
import { t, useLang } from '../i18n.js'

type Mode = 'body' | 'slides' | 'split' | 'demo' | 'source'

/**
 * The note workspace.
 *
 * While the agent is working the reader watches the file itself: the renderer
 * prefers the last contents it saw on disk over the saved body, so a note grows
 * in place instead of appearing at the end of the turn.
 *
 * A note that came from a lecture deck also carries that deck. Its pages are
 * shown as they actually look, and are rasterised into the note folder once so
 * the agent can look at a diagram rather than at our extraction of it.
 */
export function Notes() {
  const notes = useApp((s) => s.notes)
  const activeNote = useApp((s) => s.activeNote)
  const liveBody = useApp((s) => s.liveBody)
  const chatOpen = useApp((s) => s.chatOpen)
  const running = useChat((s) => s.running)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [note, setNote] = useState<Note | null>(null)
  const [source, setSource] = useState<NoteSourceInfo | null>(null)
  const [pageProgress, setPageProgress] = useState<{ done: number; total: number } | null>(null)
  const [mode, setMode] = useState<Mode>('body')
  const [draft, setDraft] = useState('')
  const [dirty, setDirty] = useState(false)
  const [listOpen, setListOpen] = useState(() => readListPreference())
  const bodyRef = useRef<HTMLDivElement>(null)
  const inlineRoots = useRef<Array<{ root: ReturnType<typeof createRoot> }>>([])
  useLang()

  useEffect(() => {
    void useApp.getState().refreshAll()
  }, [])

  // A single note selects itself, so a first-time reader lands on content.
  useEffect(() => {
    if (!currentId && notes.length === 1) setCurrentId(notes[0]!.id)
  }, [notes, currentId])

  useEffect(() => {
    if (!currentId) return
    let cancelled = false
    void window.loomnote.getNote(currentId).then(async (loaded) => {
      if (!loaded || cancelled) return
      setNote(loaded)
      setDraft(loaded.bodyMd)
      setDirty(false)
      useApp.getState().setActiveNote(loaded)
      useApp.getState().setLiveBody(loaded.bodyMd)

      const found = await window.loomnote.noteSource(loaded.id)
      if (cancelled) return
      setSource(found)
      // A fresh import has not been organised yet: show the deck the student
      // actually handed in rather than the text we scraped out of it.
      setMode(found?.kind === 'pdf' && loaded.status === 'draft' ? 'slides' : found?.kind === 'pdf' ? 'split' : 'body')
    })
    return () => {
      cancelled = true
    }
  }, [currentId])

  // Rasterise the deck once per note. Resumable: pages already on disk are
  // reported by the main process and skipped.
  useEffect(() => {
    if (!source || source.kind !== 'pdf' || !currentId) return
    const controller = new AbortController()
    setPageProgress({ done: source.pages.length, total: 0 })
    void exportPages({
      noteId: currentId,
      relPath: `source/${source.name}`,
      existing: source.pages,
      signal: controller.signal,
      onProgress: (progress) => setPageProgress(progress)
    })
      .then((result) => {
        if (controller.signal.aborted) return
        setPageProgress(null)
        if (result.written > 0) setSource({ ...source, pages: Array.from({ length: result.total }, (_, i) => i + 1) })
      })
      .catch((e: unknown) => {
        setPageProgress(null)
        if (!controller.signal.aborted) console.error('slide images could not be prepared:', e)
      })
    return () => controller.abort()
  }, [source, currentId])

  const assetBase = currentId ? assetBaseFor(currentId) : ''

  /** What the reader sees: the file on disk when we have it, else the saved row. */
  const body = useMemo(() => (activeNote && note && activeNote.id === note.id ? liveBody || note.bodyMd : note?.bodyMd ?? ''), [activeNote, note, liveBody])
  const editing = running && (liveBody || '').length > 0

  useEffect(() => {
    if ((mode !== 'body' && mode !== 'split') || !bodyRef.current || !note) return
    const { html, demos } = renderMarkdown(body, { assetBase })
    bodyRef.current.innerHTML = html
    void hydrateMarkdown(bodyRef.current).catch(() => undefined)
    inlineRoots.current.forEach((r) => r.root.unmount())
    inlineRoots.current = []
    bodyRef.current.querySelectorAll<HTMLElement>('[data-demo-idx]').forEach((el) => {
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
  }, [mode, note, body, assetBase])

  const demo = useMemo(() => (note ? renderMarkdown(body).demos : []), [note, body])

  async function save(): Promise<void> {
    if (!note) return
    await window.loomnote.noteWrite(note.id, draft)
    const updated: Note = { ...note, bodyMd: draft, updatedAt: Date.now() }
    setNote(updated)
    useApp.getState().setActiveNote(updated)
    useApp.getState().setLiveBody(draft)
    setDirty(false)
    await useApp.getState().refreshAll()
  }

  const hasSlides = source?.kind === 'pdf'

  return (
    <div className="workbench">
      <aside className={listOpen ? 'pane-side' : 'pane-side collapsed'}>
        <div className="pane-side-head">
          <h3>
            {t('notes.all')} <span style={{ color: 'var(--text3)', fontWeight: 400 }}>{notes.length}</span>
          </h3>
          <button
            className="pane-collapse"
            onClick={() => {
              const next = !listOpen
              setListOpen(next)
              try {
                localStorage.setItem(LIST_KEY, next ? '1' : '0')
              } catch {
                /* private mode */
              }
            }}
            title={listOpen ? t('notes.list.collapse') : t('notes.list.expand')}
            aria-label={listOpen ? t('notes.list.collapse') : t('notes.list.expand')}
            aria-expanded={listOpen}
          >
            {listOpen ? '«' : '»'}
          </button>
        </div>
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
                {editing ? (
                  <span className="save-chip writing">
                    <span className="spinner" /> {t('notes.generating')}
                  </span>
                ) : (
                  <span className={dirty ? 'save-chip dirty' : 'save-chip'}>{dirty ? `● ${t('notes.unsaved')}` : `✓ ${t('notes.saved')}`}</span>
                )}
              </div>
              <div className="tabs">
                <button className={mode === 'body' ? 'active' : ''} onClick={() => setMode('body')}>
                  {t('notes.tab.read')}
                </button>
                {hasSlides && (
                  <button className={mode === 'slides' ? 'active' : ''} onClick={() => setMode('slides')}>
                    {t('notes.tab.slides')}
                  </button>
                )}
                {hasSlides && (
                  <button className={mode === 'split' ? 'active' : ''} onClick={() => setMode('split')}>
                    {t('notes.tab.split')}
                  </button>
                )}
                <button className={mode === 'demo' ? 'active' : ''} onClick={() => setMode('demo')}>
                  {t('notes.tab.demo')}
                </button>
                <button className={mode === 'source' ? 'active' : ''} onClick={() => setMode('source')}>
                  {t('notes.tab.source')}
                </button>
              </div>
              <button className="btn primary" disabled={running} onClick={() => useApp.getState().setChatOpen(!chatOpen)}>
                ✳ {running ? t('notes.agent.running') : t('notes.agent.open')}
              </button>
            </div>

            {hasSlides && pageProgress && pageProgress.total > 0 && pageProgress.done < pageProgress.total && (
              <div className="page-progress">
                <span className="spinner" />
                {t('notes.slides.preparing', { done: pageProgress.done, total: pageProgress.total })}
              </div>
            )}

            <div className="note-body">
              {mode === 'body' && <div ref={bodyRef} className="md" />}
              {mode === 'slides' && source && <PdfViewer noteId={note.id} relPath={`source/${source.name}`} />}
              {mode === 'split' && source && (
                <div className="split-view">
                  <div className="split-left">
                    <PdfViewer noteId={note.id} relPath={`source/${source.name}`} />
                  </div>
                  <div className="split-right">
                    <div ref={bodyRef} className="md" />
                  </div>
                </div>
              )}
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
                  {demo.length > 0 ? (
                    // Every demo, in note order, each with the title the agent
                    // gave it: a note can carry several, and showing only the
                    // first made them look like one repeated card.
                    demo.map((html, index) => (
                      <DemoSandbox key={index} html={html} title={`${note.title} · ${index + 1}/${demo.length}`} />
                    ))
                  ) : (
                    <div className="empty-state" style={{ paddingTop: 120 }}>
                      <div className="big">🎬</div>
                      <b>{t('notes.demo.none')}</b>
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

/** Storage key for the note-list rail; read synchronously so the first frame is right. */
const LIST_KEY = 'loomnote.notelist.collapsed'

function readListPreference(): boolean {
  try {
    return localStorage.getItem(LIST_KEY) !== '0'
  } catch {
    return true
  }
}

/** Base URL the renderer uses to read a note's own folder. */
function assetBaseFor(noteId: string): string {
  return `loomnote-asset://note/${encodeURIComponent(noteId)}`
}
