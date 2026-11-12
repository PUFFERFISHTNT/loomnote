import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Course } from '../../../shared/ipc.js'
import { useApp } from '../stores/app.js'
import { useLang } from '../i18n.js'

export function Courses() {
  const zh = useLang() === 'zh'
  const notes = useApp((s) => s.notes)
  const [courses, setCourses] = useState<Course[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editedName, setEditedName] = useState('')
  const navigate = useNavigate()
  useEffect(() => { void window.loomnote.listCourses().then(setCourses).catch((e: unknown) => useApp.getState().setError(String(e))) }, [notes])
  async function create() {
    if (!name.trim() || busy) return
    setBusy(true)
    try { await window.loomnote.createCourse(name); setCourses(await window.loomnote.listCourses()); setName('') }
    catch (e) { useApp.getState().setError(String(e)) } finally { setBusy(false) }
  }
  async function update(course: Course, nextName: string, archived: boolean) {
    setBusy(true)
    try { await window.loomnote.updateCourse(course.id, nextName, archived); await useApp.getState().refreshAll(); setCourses(await window.loomnote.listCourses()); setEditing(null) }
    catch (e) { useApp.getState().setError(String(e)) } finally { setBusy(false) }
  }
  return <div className="view study-view">
    <h1 className="view-title">{zh ? '课程' : 'Courses'}</h1>
    <p className="view-sub">{zh ? '一门课程，一个资料栏目与知识点网络。创建课程后上传讲义，逐步建立自己的学习空间。' : 'A home for each course: lecture material, living notes and a connected concept map.'}</p>
    <form className="study-actions course-create" onSubmit={(e) => { e.preventDefault(); void create() }}><input className="study-search" aria-label={zh ? '新课程名称' : 'New course name'} placeholder={zh ? '例如 COMP2119 · 数据结构' : 'e.g. COMP2119 · Data Structures'} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /><button className="btn primary" disabled={busy || !name.trim()}>{zh ? '创建课程' : 'Create course'}</button></form>
    <label className="hint"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> {zh ? '显示已归档课程' : 'Show archived courses'}</label>
    <div className="course-grid">{courses.filter((c) => showArchived || !c.archived).map((course) => {
      const members = notes.filter((n) => n.course === course.name)
      return <article className="study-card course-card" key={course.id}><span className="course-icon">📁</span>
        {editing === course.id ? <form onSubmit={(e) => { e.preventDefault(); void update(course, editedName, course.archived) }}><input className="study-search" aria-label={zh ? '课程名称' : 'Course name'} maxLength={120} value={editedName} onChange={(e) => setEditedName(e.target.value)} /><div className="study-actions"><button className="btn" disabled={busy}>{zh ? '保存' : 'Save'}</button><button type="button" className="btn ghost" onClick={() => setEditing(null)}>{zh ? '取消' : 'Cancel'}</button></div></form> : <h2>{course.name}</h2>}
        <p className="hint">{members.length} {zh ? '份笔记' : 'notes'} {course.archived ? (zh ? '· 已归档' : '· archived') : ''}</p>
        <div className="study-actions"><button className="btn primary" disabled={course.archived} onClick={() => navigate(`/imports?course=${encodeURIComponent(course.name)}`)}>{zh ? '上传资料' : 'Upload material'}</button><button className="btn" onClick={() => navigate(`/notes?course=${encodeURIComponent(course.name)}`)}>{zh ? '笔记' : 'Notes'}</button><button className="btn" onClick={() => navigate(`/graph?course=${encodeURIComponent(course.name)}`)}>{zh ? '知识图谱' : 'Concept map'}</button></div>
        <div className="course-recent">{members.slice(0, 4).map((note) => <button className="graph-related" key={note.id} onClick={() => navigate(`/notes/${encodeURIComponent(note.id)}`)}>{note.title}</button>)}</div>
        <div className="study-actions course-manage"><button className="btn ghost" disabled={busy} onClick={() => { setEditing(course.id); setEditedName(course.name) }}>{zh ? '重命名' : 'Rename'}</button><button className="btn ghost" disabled={busy} onClick={() => void update(course, course.name, !course.archived)}>{course.archived ? (zh ? '恢复课程' : 'Restore') : (zh ? '归档' : 'Archive')}</button></div>
      </article>
    })}</div>
    {!courses.length && <div className="empty-state"><b>{zh ? '先创建一门课程' : 'Create your first course'}</b><span>{zh ? '课程即使还没有资料，也会保留在这里。' : 'Your course stays here even before you upload material.'}</span></div>}
  </div>
}
