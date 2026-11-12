import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { NoteGraph } from '@loomnote/core'
import { useApp } from '../stores/app.js'
import { useLang } from '../i18n.js'

export function Graph() {
  const zh = useLang() === 'zh'
  const notes = useApp((s) => s.notes)
  const [graph, setGraph] = useState<NoteGraph>({ courses: [], nodes: [], edges: [] })
  const [selected, setSelected] = useState('')
  const [query, setQuery] = useState('')
  const [courses, setCourses] = useState<string[]>([])
  const [params] = useSearchParams()
  const navigate = useNavigate()
  useEffect(() => {
    let cancelled = false
    void window.loomnote.noteGraph().then((value) => { if (!cancelled) { setGraph(value); setCourses((previous) => previous.length ? previous : [params.get('course') ?? value.courses[0] ?? '']) } }).catch((e: unknown) => useApp.getState().setError(String(e)))
    return () => { cancelled = true }
  }, [notes])
  const nodes = graph.nodes.filter((n) => courses.includes(n.course) && `${n.title} ${n.description}`.toLowerCase().includes(query.toLowerCase()))
  const selectedNode = nodes.find((n) => n.id === selected)
  const positions = useMemo(() => {
    const points = new Map(nodes.map((n, i) => {
    const angle = i / Math.max(1, nodes.length) * Math.PI * 2 - Math.PI / 2
    return [n.id, { x: 360 + Math.cos(angle) * (nodes.length > 1 ? 245 : 0), y: 290 + Math.sin(angle) * (nodes.length > 1 ? 215 : 0) }]
    }))
    // Deterministic spring layout; no external graph runtime or network requests.
    for (let iteration = 0; iteration < 160; iteration++) {
      const force = new Map(nodes.map((n) => [n.id, { x: 0, y: 0 }]))
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = points.get(nodes[i]!.id)!, b = points.get(nodes[j]!.id)!
        const dx = a.x - b.x, dy = a.y - b.y, d = Math.max(12, Math.hypot(dx, dy))
        const amount = 3500 / (d * d)
        force.get(nodes[i]!.id)!.x += dx / d * amount; force.get(nodes[i]!.id)!.y += dy / d * amount
        force.get(nodes[j]!.id)!.x -= dx / d * amount; force.get(nodes[j]!.id)!.y -= dy / d * amount
      }
      for (const edge of graph.edges) {
        const a = points.get(edge.from), b = points.get(edge.to)
        if (!a || !b) continue
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.max(1, Math.hypot(dx, dy)), amount = (d - 130) * .018
        force.get(edge.from)!.x += dx / d * amount; force.get(edge.from)!.y += dy / d * amount
        force.get(edge.to)!.x -= dx / d * amount; force.get(edge.to)!.y -= dy / d * amount
      }
      for (const [id, p] of points) { const f = force.get(id)!; p.x = Math.max(75, Math.min(645, p.x + f.x + (360 - p.x) * .002)); p.y = Math.max(50, Math.min(510, p.y + f.y + (280 - p.y) * .002)) }
    }
    return points
  }, [nodes, graph.edges])
  const related = graph.edges.filter((e) => (e.from === selected || e.to === selected) && nodes.some((n) => n.id === e.from) && nodes.some((n) => n.id === e.to))
  return <div className="view study-view">
    <h1 className="view-title">{zh ? '课程知识点图谱' : 'Course concept maps'}</h1>
    <p className="view-sub">{zh ? '每个节点是课程里的具体知识点。点击可查看定义、知识点关系和来源；同课程多份笔记中的同名知识点会合并。' : 'Each node is a specific knowledge point. Select one for its definition, relationships and sources. Repeated concepts are joined within each course.'}</p>
    <div className="study-actions" style={{ marginBottom: 16 }}><b>{zh ? '课程文件夹' : 'Course folders'}</b><button className="btn ghost" onClick={() => { setCourses([...graph.courses, '']); setSelected('') }}>{zh ? '显示全部' : 'Show all'}</button><span className="hint">{nodes.length} {zh ? '个节点' : 'nodes'}</span></div>
    <div className="study-actions course-map-filters">{[...graph.courses, ...(graph.nodes.some((n) => !n.course) ? [''] : [])].map((course) => <label key={course}><input type="checkbox" checked={courses.includes(course)} onChange={(e) => { setCourses((previous) => e.target.checked ? [...previous, course] : previous.filter((c) => c !== course)); setSelected('') }} /> 📁 {course || (zh ? '未分类' : 'Unsorted')}</label>)}</div>
    <input className="study-search" aria-label={zh ? '搜索知识点或定义' : 'Search concepts or definitions'} placeholder={zh ? '搜索知识点或定义…' : 'Search concepts or definitions…'} value={query} onChange={(e) => { setQuery(e.target.value); setSelected('') }} />
    {nodes.length ? <div className="graph-layout"><svg className="note-graph" viewBox="0 0 720 580" role="img" aria-label={zh ? '课程知识点网络' : 'Course knowledge network'}>
      <defs><marker id="concept-arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text3)" /></marker></defs>
      {graph.edges.map((e, i) => { const a = positions.get(e.from), b = positions.get(e.to); const active = e.from === selected || e.to === selected; return a && b ? <g key={i}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={active ? '#356fbc' : 'var(--line2)'} strokeWidth={active ? '2.5' : '1.5'} markerEnd="url(#concept-arrow)"><title>{e.label}</title></line>{active && <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} textAnchor="middle" fill="var(--text)" fontSize="11" stroke="var(--bg)" strokeWidth="3" paintOrder="stroke">{e.label}</text>}</g> : null })}
      {nodes.map((n) => { const p = positions.get(n.id)!; return <g key={n.id} role="button" tabIndex={0} aria-label={n.title} aria-pressed={selected === n.id} onClick={() => setSelected(n.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(n.id) } }} style={{ cursor: 'pointer' }}>
        <circle cx={p.x} cy={p.y} r={selected === n.id ? 23 : 17} fill={selected === n.id ? '#356fbc' : ['#75ab94', '#94afd2', '#b7a1ce', '#d5af7a'][Math.max(0, graph.courses.indexOf(n.course)) % 4]} />
        <text x={p.x} y={p.y + 40} textAnchor="middle" fill="var(--text)" fontSize="13">{n.title.length > 24 ? `${n.title.slice(0, 23)}…` : n.title}</text><title>{n.title}</title>
      </g> })}
    </svg><aside className="study-card graph-details">
      <h3>{selectedNode?.title ?? (zh ? '选择一个知识点' : 'Choose a knowledge point')}</h3>
      {selectedNode && <><p className="hint">{selectedNode.course}</p><p>{selectedNode.description || (zh ? '此知识点来自笔记标题。整理笔记时让助教补充知识点定义和关系。' : 'Extracted from a concept heading. Ask the study agent to add a definition and relationships when organising the note.')}</p>
        <b>{zh ? '来源笔记' : 'Source notes'}</b>{selectedNode.sources.map((s, i) => <button className="graph-related" key={i} onClick={() => navigate(`/notes/${encodeURIComponent(s.noteId)}${s.page ? `?page=${s.page}` : ''}`)}><b>{s.noteTitle}</b><span>{s.heading}{s.page ? ` · p. ${s.page}` : ''} ↗</span></button>)}</>}
      {selectedNode && related.length === 0 && <p className="hint">{zh ? '尚无明确的知识点关系。整理笔记时可补充有来源的关系。' : 'No explicit relationships yet. Organise the note to add relationships grounded in the material.'}</p>}
      {related.map((edge, i) => { const id = edge.from === selected ? edge.to : edge.from; return <button key={i} className="graph-related" onClick={() => setSelected(id)}><b>{graph.nodes.find((n) => n.id === id)?.title}</b><span>{edge.from === selected ? '→' : '←'} {edge.label}</span></button> })}
      <div className="graph-note-list">{nodes.map((n) => <button className="btn ghost" key={n.id} onClick={() => setSelected(n.id)}>{n.title}</button>)}</div>
    </aside></div> : <div className="empty-state"><b>{zh ? '这门课程还没有匹配的知识点' : 'No matching concepts in this course'}</b><p>{zh ? '上传课程资料后，让助教整理成笔记并提取具体知识点与关系。也可以手动添加知识点标题或粗体定义。' : 'Import course material and ask the study agent to organise it into specific knowledge points and relationships. Concept headings and bold definitions also work.'}</p></div>}
  </div>
}
