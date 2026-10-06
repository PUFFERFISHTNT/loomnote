import { useState } from 'react'
import { useApp } from '../stores/app.js'
import { locale, t, useLang } from '../i18n.js'

const KIND_ICON: Record<string, string> = { md: '📝', pdf: '📕', image: '🖼', html: '🌐', url: '🔗', word: '📘', excel: '📊' }

export function Imports() {
  const imports = useApp((s) => s.imports)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  useLang()

  async function importFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy(true)
    try {
      for (const f of Array.from(files)) {
        const path = await window.loomnote.getPathForFile(f)
        if (path) await window.loomnote.addImportMd(path)
      }
      await useApp.getState().refreshAll()
    } catch (e) {
      useApp.getState().setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function pick() {
    const path = await window.loomnote.pickImport()
    if (!path) return
    setBusy(true)
    try {
      await window.loomnote.addImportMd(path)
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
