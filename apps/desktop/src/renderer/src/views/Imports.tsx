import { useState } from 'react'
import { useApp } from '../stores/app.js'

const KIND_ICON: Record<string, string> = { md: '📝', pdf: '📕', image: '🖼', html: '🌐', url: '🔗', word: '📘', excel: '📊' }

export function Imports() {
  const imports = useApp((s) => s.imports)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)

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
      <h1 className="view-title">资料箱</h1>
      <p className="view-sub">拖入或选择文件，解析后自动生成笔记（PDF 提取正文文本；公式与插图随 AI 整理进入笔记）。</p>

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
        <b>{busy ? '正在解析导入…' : dragging ? '松手即导入' : '把文件拖到这里'}</b>
        <span>支持 PDF · Markdown · TXT ｜ 或</span>
        <div style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => void pick()} disabled={busy}>
            选择文件…
          </button>
        </div>
      </div>

      <div className="section-title">导入记录</div>
      {imports.length === 0 ? (
        <div className="empty-state" style={{ paddingTop: 36 }}>
          <div className="big">📭</div>
          <b>暂无导入记录</b>
          <span>Word / Excel 解析在后续版本加入；当前 PDF 与 Markdown 已全链路可用。</span>
        </div>
      ) : (
        <table className="tbl" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>文件</th>
              <th>类型</th>
              <th>状态</th>
              <th>时间</th>
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
                  <span className={r.status === 'done' ? 'chip ok' : 'chip warn'}>{r.status === 'done' ? '✓ 已完成' : r.status}</span>
                </td>
                <td style={{ color: 'var(--text3)' }}>{new Date(r.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}