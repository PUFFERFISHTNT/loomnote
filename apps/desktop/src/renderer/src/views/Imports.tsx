import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Course } from '../../../shared/ipc.js'
import { useApp } from '../stores/app.js'
import { locale, t, useLang } from '../i18n.js'

const KIND_ICON: Record<string, string> = { md: '📝', pdf: '📕', image: '🖼', html: '🌐', url: '🔗', word: '📘', excel: '📊' }

export function Imports() {
  const imports = useApp((s) => s.imports)
  const [params] = useSearchParams()
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [course, setCourse] = useState(() => params.get('course') ?? '')
  const [courses, setCourses] = useState<Course[]>([])
  const [results, setResults] = useState<Array<{ name: string; ok: boolean; message: string }>>([])
  const zh = useLang() === 'zh'
  const notes = useApp((s) => s.notes)
  useEffect(() => { setCourse(params.get('course') ?? '') }, [params])
  useEffect(() => { void window.loomnote.listCourses().then(setCourses).catch((e: unknown) => useApp.getState().setError(String(e))) }, [])

  async function importFiles(files: FileList | null) {
    if (busy || !files || files.length === 0) return
    setBusy(true)
    setResults([])
    try {
      for (const f of Array.from(files)) {
        try {
        const path = await window.loomnote.getPathForFile(f)
        if (!path) throw new Error('This file has no readable local path.')
        await window.loomnote.addImportMd(path, course)
        setResults((previous) => [...previous, { name: f.name, ok: true, message: zh ? '已导入' : 'Imported' }])
        } catch (e) { setResults((previous) => [...previous, { name: f.name, ok: false, message: e instanceof Error ? e.message : String(e) }]) }
      }
      await useApp.getState().refreshAll()
    } catch (e) {
      useApp.getState().setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function pick() {
    if (busy) return
    const paths = await window.loomnote.pickImports()
    if (!paths.length) return
    setBusy(true)
    setResults([])
    try {
      for (const path of paths) {
        const name = path.split(/[\\/]/).pop() ?? path
        try { await window.loomnote.addImportMd(path, course); setResults((previous) => [...previous, { name, ok: true, message: zh ? '已导入' : 'Imported' }]) }
        catch (e) { setResults((previous) => [...previous, { name, ok: false, message: e instanceof Error ? e.message : String(e) }]) }
      }
      await useApp.getState().refreshAll()
    } catch (e) {
      useApp.getState().setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="view">
      <h1 className="view-title">{t('inbox.title')}</h1>
      <p className="view-sub">{t('inbox.sub')}</p>
      <label className="course-field">{zh ? '课程文件夹' : 'Course folder'}<input className="study-search" list="import-courses" value={course} maxLength={120} onChange={(e) => setCourse(e.target.value)} placeholder={zh ? '例如 COMP2119；留空使用原文件夹名称' : 'e.g. COMP2119; blank uses the source folder name'} /></label>
      <datalist id="import-courses">{[...new Set([...courses.filter((c) => !c.archived).map((c) => c.name), ...notes.map((n) => n.course).filter(Boolean)])].map((c) => <option key={c} value={c} />)}</datalist>

      <div
        className={dragging ? 'dropzone on' : 'dropzone'}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void importFiles(e.dataTransfer.files)
        }}
      >
        <div className="big">{busy ? <span className="spinner" /> : dragging ? '📥' : '🗂'}</div>
        <b>{busy ? t('inbox.drop.parsing') : dragging ? t('inbox.drop.release') : t('inbox.drop.idle')}</b>
        <span>{t('inbox.drop.hint')}</span>
        <div style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => void pick()} disabled={busy}>
            {t('inbox.choose')}
          </button>
        </div>
      </div>

      {results.length > 0 && <div className="import-results" role="status">{results.map((r, i) => <p key={i} className={r.ok ? 'connection-ok' : 'connection-fail'}><b>{r.name}</b> — {r.message}</p>)}</div>}

      <div className="section-title">{t('inbox.history')}</div>
      {imports.length === 0 ? (
        <div className="empty-state" style={{ paddingTop: 36 }}>
          <div className="big">📭</div>
          <b>{t('inbox.none')}</b>
          <span>{t('inbox.none.hint')}</span>
        </div>
      ) : (
        <table className="tbl" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>{t('inbox.col.file')}</th>
              <th>{t('inbox.col.type')}</th>
              <th>{t('inbox.col.status')}</th>
              <th>{t('inbox.col.time')}</th>
            </tr>
          </thead>
          <tbody>
            {imports.map((r) => (
              <tr key={r.id}>
                <td style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="kind-ico">{KIND_ICON[r.kind] ?? '📄'}</span>
                  <span style={{ fontWeight: 500 }}>{r.sourcePath.split(/[\\/]/).pop()}</span>
                </td>
                <td>{r.kind.toUpperCase()}</td>
                <td>
                  <span className={r.status === 'done' ? 'chip ok' : 'chip warn'}>{r.status === 'done' ? t('inbox.status.done') : r.status}</span>
                </td>
                <td style={{ color: 'var(--text3)' }}>{new Date(r.createdAt).toLocaleString(locale(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
