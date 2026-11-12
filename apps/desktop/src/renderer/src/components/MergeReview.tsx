import { useState } from 'react'
import type { Note } from '@loomnote/core'
import type { MergeProposal } from '../../../shared/ipc.js'
import { useApp } from '../stores/app.js'
import { useLang } from '../i18n.js'

export function MergeReview({ proposal, onApplied, onClose }: { proposal: MergeProposal; onApplied: (note: Note) => void; onClose: () => void }) {
  const zh = useLang() === 'zh'
  const [selected, setSelected] = useState(proposal.changes.filter((c) => c.kind === 'add').map((c) => c.id))
  const [busy, setBusy] = useState(false)
  async function apply() {
    setBusy(true)
    try { onApplied(await window.loomnote.mergeApply(proposal.noteId, proposal.id, selected)); onClose() }
    catch (e) { useApp.getState().setError(String(e)) } finally { setBusy(false) }
  }
  return <div className="modal-shade"><section role="dialog" aria-modal="true" aria-labelledby="merge-title" className="merge-dialog">
    <h2 id="merge-title">{zh ? '审核讲义合并' : 'Review lecture merge'}</h2>
    <p>{proposal.sourceName}</p><p className="hint">{zh ? '按章节标题比较；完全相同的章节自动跳过。更新需要勾选确认，未选部分保持原样。' : 'Sections are compared by heading; identical sections are skipped. Select updates explicitly. Unselected sections keep their original text.'}</p>
    <div className="merge-changes">{proposal.changes.map((change) => <details key={change.id} open={change.kind === 'update'}>
      <summary><label onClick={(e) => e.stopPropagation()}><input type="checkbox" disabled={busy || change.kind === 'skip'} checked={selected.includes(change.id)} onChange={(e) => setSelected((ids) => e.target.checked ? [...ids, change.id] : ids.filter((id) => id !== change.id))} /> <span className="chip gray">{change.kind === 'add' ? (zh ? '新增' : 'Add') : change.kind === 'update' ? (zh ? '更新' : 'Update') : (zh ? '相同，跳过' : 'Identical, skip')}</span> {change.title}</label></summary>
      <div className="merge-diff">{change.before && <div><b>{zh ? '原文' : 'Before'}</b><pre>{change.before}</pre></div>}<div><b>{zh ? '合入内容' : 'After'}</b><pre>{change.after}</pre></div></div>
    </details>)}</div>
    <div className="study-actions"><button className="btn" disabled={busy} onClick={onClose}>{zh ? '取消' : 'Cancel'}</button><button className="btn primary" disabled={busy || !selected.length} onClick={() => void apply()}>{busy ? '…' : (zh ? `应用 ${selected.length} 项变更` : `Apply ${selected.length} changes`)}</button></div>
  </section></div>
}
