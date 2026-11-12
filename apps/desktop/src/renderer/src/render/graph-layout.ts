import type { NoteGraph } from '@loomnote/core'

export const CONCEPT_WIDTH = 240
export const CONCEPT_HEIGHT = 86
export const MAP_WIDTH = 940

/** Stable course panels and label-sized nodes keep dense maps readable. */
export function layoutConceptMap(nodes: NoteGraph['nodes'], edges: NoteGraph['edges']) {
  const positions = new Map<string, { x: number; y: number }>()
  const panels: Array<{ course: string; y: number; height: number; count: number }> = []
  let top = 0
  for (const course of [...new Set(nodes.map((node) => node.course))].sort()) {
    const members = nodes.filter((node) => node.course === course)
    const remaining = new Set(members.map((node) => node.id))
    const byId = new Map(members.map((node) => [node.id, node]))
    const neighbours = new Map(members.map((node) => [node.id, new Set<string>()]))
    for (const edge of edges) if (remaining.has(edge.from) && remaining.has(edge.to)) {
      neighbours.get(edge.from)!.add(edge.to)
      neighbours.get(edge.to)!.add(edge.from)
    }
    const compare = (a: string, b: string) => neighbours.get(b)!.size - neighbours.get(a)!.size ||
      byId.get(a)!.title.localeCompare(byId.get(b)!.title) || a.localeCompare(b)
    const order: string[] = []
    while (remaining.size) {
      const queue = [[...remaining].sort(compare)[0]!]
      while (queue.length) {
        const id = queue.shift()!
        if (!remaining.delete(id)) continue
        order.push(id)
        queue.push(...[...neighbours.get(id)!].filter((next) => remaining.has(next)).sort(compare))
      }
    }
    const columns = Math.min(3, members.length)
    const rows = Math.ceil(members.length / columns)
    const height = 110 + rows * CONCEPT_HEIGHT + Math.max(0, rows - 1) * 64
    order.forEach((id, index) => {
      const row = Math.floor(index / columns)
      const column = row % 2 ? columns - 1 - index % columns : index % columns
      positions.set(id, {
        x: MAP_WIDTH / 2 + (column - (columns - 1) / 2) * 292,
        y: top + 83 + row * (CONCEPT_HEIGHT + 64) + CONCEPT_HEIGHT / 2
      })
    })
    panels.push({ course, y: top, height, count: members.length })
    top += height + 24
  }
  return { positions, panels, width: MAP_WIDTH, height: Math.max(200, top - 24) }
}

export function conceptLabel(title: string): string[] {
  const lines: string[] = []
  let line = ''
  const width = (text: string) => [...text].reduce((total, char) =>
    total + (/[^\u0000-\u00ff]/.test(char) ? 2 : /[MW@]/.test(char) ? 1.5 : /\s/.test(char) ? .5 : 1), 0)
  for (const word of title.split(/\s+/)) {
    if (line && width(line + ' ' + word) > 33) { lines.push(line); line = '' }
    for (const char of (line ? ' ' : '') + word) {
      if (line && width(line + char) > 33) { lines.push(line); line = '' }
      line += char
    }
  }
  if (line) lines.push(line)
  return lines.length > 2 ? [lines[0]!, lines[1]!.slice(0, 31) + '…'] : lines
}

/** End the arrow at the card border, rather than behind its label. */
export function conceptEdge(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const dx = b.x - a.x, dy = b.y - a.y
  const factor = Math.min(dx ? CONCEPT_WIDTH / 2 / Math.abs(dx) : Infinity,
    dy ? CONCEPT_HEIGHT / 2 / Math.abs(dy) : Infinity)
  if (!Number.isFinite(factor)) return ''
  return `M ${a.x + dx * factor} ${a.y + dy * factor} L ${b.x - dx * factor} ${b.y - dy * factor}`
}
