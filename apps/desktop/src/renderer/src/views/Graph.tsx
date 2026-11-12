import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { NoteGraph } from '@loomnote/core'
import { useApp } from '../stores/app.js'
import { useLang } from '../i18n.js'
import { conceptEdge, conceptLabel, CONCEPT_HEIGHT, CONCEPT_WIDTH, layoutConceptMap } from '../render/graph-layout.js'

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
  const layout = useMemo(() => layoutConceptMap(nodes, graph.edges), [nodes, graph.edges])
  const related = graph.edges.filter((e) => (e.from === selected || e.to === selected) && nodes.some((n) => n.id === e.from) && nodes.some((n) => n.id === e.to))
  return <div className="view study-view">
    <h1 className="view-title">{zh ? '课程知识点图谱' : 'Course concept maps'}</h1>
    <p className="view-sub">{zh ? '每个节点是课程里的具体知识点。点击可查看定义、知识点关系和来源；同课程多份笔记中的同名知识点会合并。' : 'Each node is a specific knowledge point. Select one for its definition, relationships and sources. Repeated concepts are joined within each course.'}</p>
    <div className="study-actions" style={{ marginBottom: 16 }}><b>{zh ? '课程文件夹' : 'Course folders'}</b><button className="btn ghost" onClick={() => { setCourses([...graph.courses, '']); setSelected('') }}>{zh ? '显示全部' : 'Show all'}</button><span className="hint">{nodes.length} {zh ? '个节点' : 'nodes'}</span></div>
    <div className="study-actions course-map-filters">{[...graph.courses, ...(graph.nodes.some((n) => !n.course) ? [''] : [])].map((course) => <label key={course}><input type="checkbox" checked={courses.includes(course)} onChange={(e) => { setCourses((previous) => e.target.checked ? [...previous, course] : previous.filter((c) => c !== course)); setSelected('') }} /> 📁 {course || (zh ? '未分类' : 'Unsorted')}</label>)}</div>
    <input className="study-search" aria-label={zh ? '搜索知识点或定义' : 'Search concepts or definitions'} placeholder={zh ? '搜索知识点或定义…' : 'Search concepts or definitions…'} value={query} onChange={(e) => { setQuery(e.target.value); setSelected('') }} />
    {nodes.length ? <div className="graph-layout"><div className="concept-map-scroll" tabIndex={0} aria-label={zh ? '可滚动知识点图谱' : 'Scrollable concept map'}><svg className="note-graph" viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label={zh ? '课程知识点网络' : 'Course knowledge network'}>
      <defs><marker id="concept-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text3)" /></marker></defs>
      {layout.panels.map((panel) => <g key={panel.course}>
        <rect x="1" y={panel.y + 1} width={layout.width - 2} height={panel.height - 2} rx="16" fill="var(--bg)" stroke="var(--line)" />
        <text x="32" y={panel.y + 36} fill="var(--text)" fontWeight="650" fontSize="16">{panel.course || (zh ? '未分类' : 'Unsorted')}</text>
        <text x={layout.width - 32} y={panel.y + 36} textAnchor="end" fill="var(--text3)" fontSize="12">{panel.count} {zh ? '个知识点' : 'concepts'}</text>
      </g>)}
      {graph.edges.map((e, i) => { const a = layout.positions.get(e.from), b = layout.positions.get(e.to); const active = e.from === selected || e.to === selected; return a && b ? <g key={i}>
        <path d={conceptEdge(a, b)} fill="none" stroke={active ? '#356fbc' : 'var(--line2)'} strokeWidth={active ? '2.5' : '1.5'} markerEnd="url(#concept-arrow)"><title>{e.label}</title></path>
      </g> : null })}
      {nodes.map((n) => { const p = layout.positions.get(n.id)!; const active = selected === n.id; const labels = conceptLabel(n.title); return <g key={n.id} role="button" tabIndex={0} aria-label={n.title} aria-pressed={active} onClick={() => setSelected(n.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(n.id) } }} style={{ cursor: 'pointer' }}>
        <rect x={p.x - CONCEPT_WIDTH / 2} y={p.y - CONCEPT_HEIGHT / 2} width={CONCEPT_WIDTH} height={CONCEPT_HEIGHT} rx="12" fill={active ? '#e8f0fa' : 'var(--bg-side)'} stroke={active ? '#356fbc' : 'var(--line2)'} strokeWidth={active ? 2.5 : 1} />
        <circle cx={p.x - CONCEPT_WIDTH / 2 + 18} cy={p.y - 23} r="4" fill={['#75ab94', '#94afd2', '#b7a1ce', '#d5af7a'][Math.max(0, graph.courses.indexOf(n.course)) % 4]} />
        <text x={p.x - CONCEPT_WIDTH / 2 + 31} y={p.y - 19} fill="var(--text3)" fontSize="10">{n.sources[0]?.page ? `p. ${n.sources[0].page}` : (zh ? '知识点' : 'CONCEPT')}{n.sources.length > 1 ? ` · ${n.sources.length} sources` : ''}</text>
        <text x={p.x - CONCEPT_WIDTH / 2 + 15} y={p.y + (labels.length > 1 ? 5 : 13)} fill="var(--text)" fontSize="12.5" fontWeight="550">{labels.map((line, index) => <tspan key={index} x={p.x - CONCEPT_WIDTH / 2 + 15} dy={index ? 18 : 0}>{line}</tspan>)}</text><title>{n.title}</title>
      </g> })}
    </svg></div><aside className="study-card graph-details">
      <h3>{selectedNode?.title ?? (zh ? '选择一个知识点' : 'Choose a knowledge point')}</h3>
      {selectedNode && <><p className="hint">{selectedNode.course}</p><p>{selectedNode.description || (zh ? '此知识点来自笔记标题。整理笔记时让助教补充知识点定义和关系。' : 'Extracted from a concept heading. Ask the study agent to add a definition and relationships when organising the note.')}</p>
        <b>{zh ? '来源笔记' : 'Source notes'}</b>{selectedNode.sources.map((s, i) => <button className="graph-related" key={i} onClick={() => navigate(`/notes/${encodeURIComponent(s.noteId)}${s.page ? `?page=${s.page}` : ''}`)}><b>{s.noteTitle}</b><span>{s.heading}{s.page ? ` · p. ${s.page}` : ''} ↗</span></button>)}</>}
      {selectedNode && related.length === 0 && <p className="hint">{zh ? '尚无明确的知识点关系。整理笔记时可补充有来源的关系。' : 'No explicit relationships yet. Organise the note to add relationships grounded in the material.'}</p>}
      {related.map((edge, i) => { const id = edge.from === selected ? edge.to : edge.from; return <button key={i} className="graph-related" onClick={() => setSelected(id)}><b>{graph.nodes.find((n) => n.id === id)?.title}</b><span>{edge.from === selected ? '→' : '←'} {edge.label}</span></button> })}
      <div className="graph-note-list">{nodes.map((n) => <button className="btn ghost" key={n.id} onClick={() => setSelected(n.id)}>{n.title}</button>)}</div>
    </aside></div> : <div className="empty-state"><b>{zh ? '这门课程还没有匹配的知识点' : 'No matching concepts in this course'}</b><p>{zh ? '上传课程资料后，让助教整理成笔记并提取具体知识点与关系。也可以手动添加知识点标题或粗体定义。' : 'Import course material and ask the study agent to organise it into specific knowledge points and relationships. Concept headings and bold definitions also work.'}</p></div>}
  </div>
}
