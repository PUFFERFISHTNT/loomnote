import type { Note } from './types.js'

export interface ConceptSource {
  noteId: string
  noteTitle: string
  heading: string
  page?: number
}
export interface NoteGraph {
  courses: string[]
  nodes: Array<{
    id: string; title: string; description: string; tags: string[]; course: string
    noteId: string; noteTitle: string; heading: string; sources: ConceptSource[]
  }>
  edges: Array<{ from: string; to: string; kind: 'link' | 'contains' | 'related'; label: string }>
}
interface Point { title: string; description: string; heading: string; page?: number }
interface Relation { from: string; to: string; label: string; kind: 'link' | 'contains' | 'related' }
const key = (s: string): string => s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
const clean = (s: string): string => s.replace(/\*\*|`/g, '').trim()
const generic = /^(?:(?:self[- ]?test|quiz|quick recall|references|answers|contents|overview|introduction|summary|key concepts|learning objectives|lecture notes|source text|extracted text|interactive demo)\b|自测|自检|练习|速记|参考|答案|目录|概述|简介|总结|知识要点|学习目标|原文|提取文本|交互演示)/i
const metadata = /<!--\s*loomnote:concepts\s+([\s\S]*?)-->/g

/** Structured points are authored alongside the study note, with source citations.
 * Existing notes also work: meaningful headings and bold definitions are a local fallback.
 * Files and course folders are provenance/filtering, never knowledge-point nodes.
 */
function extract(note: Note): { points: Point[]; relations: Relation[] } {
  const points: Point[] = [], relations: Relation[] = []
  for (const match of note.bodyMd.matchAll(metadata)) {
    try {
      const value = JSON.parse(match[1]!) as Record<string, unknown>
      if (!Array.isArray(value.concepts)) continue
      for (const raw of value.concepts.slice(0, 120)) {
        if (!raw || typeof raw !== 'object') continue
        const p = raw as Record<string, unknown>
        if (typeof p.title !== 'string' || !p.title.trim() || p.title.length > 160) continue
        points.push({ title: clean(p.title), description: typeof p.description === 'string' ? p.description.slice(0, 2000) : '',
          heading: typeof p.heading === 'string' ? p.heading : clean(p.title),
          ...(Number.isInteger(p.page) && Number(p.page) > 0 ? { page: Number(p.page) } : {}) })
      }
      if (Array.isArray(value.relations)) for (const raw of value.relations.slice(0, 240)) {
        if (!raw || typeof raw !== 'object') continue
        const r = raw as Record<string, unknown>
        if (typeof r.from === 'string' && typeof r.to === 'string' && typeof r.label === 'string' && r.label.trim()) {
          relations.push({ from: r.from, to: r.to, label: r.label.slice(0, 100), kind: 'related' })
        }
      }
    } catch { /* A partial streamed or malformed block must not break the map. */ }
  }
  const hasStructured = points.length > 0
  const text = note.bodyMd.replace(metadata, '').replace(/:::demo\b[^\n]*\n[\s\S]*?^:::\s*$/gm, '').replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, '')
  let parent = '', heading = '', excludedDepth = 0
  for (const line of text.split(/\r?\n/)) {
    const h = /^(#{1,6})\s+(.+)/.exec(line)
    if (h) {
      const depth = h[1]!.length, title = clean(h[2]!)
      if (excludedDepth && depth > excludedDepth) continue
      excludedDepth = 0
      if (generic.test(title)) { excludedDepth = depth; heading = ''; continue }
      heading = title
      if (depth < 2 || depth > 4) continue
      if (!hasStructured) points.push({ title, description: '', heading: title })
      if (!hasStructured && depth > 2 && parent) relations.push({ from: parent, to: title, kind: 'contains', label: 'includes' })
      if (depth === 2) parent = title
    } else if (!excludedDepth && !hasStructured) {
      const definition = /^\s*(?:[-*+]\s+)?\*\*([^*\n]{2,100})\*\*\s*[:：—–-]\s*(.+)/.exec(line)
      if (definition && !generic.test(definition[1]!)) {
        points.push({ title: clean(definition[1]!), description: definition[2]!, heading })
        if (heading) relations.push({ from: heading, to: definition[1]!, kind: 'contains', label: 'includes' })
      }
    }
    if (!excludedDepth && heading) for (const link of line.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) {
      relations.push({ from: heading, to: link[1]!.split('#').at(-1)!, kind: 'link', label: 'references' })
    }
  }
  return { points, relations }
}

export function buildNoteGraph(notes: Note[]): NoteGraph {
  const graph: NoteGraph = { courses: [], nodes: [], edges: [] }
  const nodes = new Map<string, NoteGraph['nodes'][number]>()
  const relations: Array<Relation & { course: string }> = []
  for (const note of notes) {
    const course = typeof note.frontMatter.course === 'string' ? note.frontMatter.course.trim() : ''
    if (course && !graph.courses.includes(course)) graph.courses.push(course)
    const extracted = extract(note)
    for (const p of extracted.points) {
      const id = JSON.stringify([course, key(p.title)])
      const source: ConceptSource = { noteId: note.id, noteTitle: note.title, heading: p.heading, ...(p.page ? { page: p.page } : {}) }
      const existing = nodes.get(id)
      if (existing) {
        if (!existing.sources.some((s) => s.noteId === note.id && s.heading === p.heading)) existing.sources.push(source)
        if (!existing.description) existing.description = p.description
      } else nodes.set(id, { id, title: p.title, description: p.description, tags: [], course,
        noteId: note.id, noteTitle: note.title, heading: p.heading, sources: [source] })
    }
    relations.push(...extracted.relations.map((r) => ({ ...r, course })))
  }
  for (const r of relations) {
    const from = JSON.stringify([r.course, key(r.from)]), to = JSON.stringify([r.course, key(r.to)])
    if (from === to || !nodes.has(from) || !nodes.has(to)) continue
    if (!graph.edges.some((e) => e.from === from && e.to === to && e.label === r.label)) graph.edges.push({ from, to, kind: r.kind, label: r.label })
  }
  graph.nodes = [...nodes.values()]
  graph.courses.sort()
  return graph
}
