import { describe, expect, it } from 'vitest'
import type { NoteGraph } from '@loomnote/core'
import { CONCEPT_HEIGHT, CONCEPT_WIDTH, conceptLabel, layoutConceptMap } from '../src/renderer/src/render/graph-layout.js'

const makeNodes = (count: number, course: string): NoteGraph['nodes'] => Array.from({ length: count }, (_, i) => ({
  id: `${course}-${i}`, title: `Concept ${i}`, description: '', tags: [], course, noteId: 'n', noteTitle: 'Lecture', heading: '', sources: []
}))

describe('readable concept map layout', () => {
  it('keeps label cards apart and inside separate course panels, including dense old notes', () => {
    const nodes = [...makeNodes(12, 'SDST2601'), ...makeNodes(8, 'COMP2119'), ...makeNodes(90, '')]
    const result = layoutConceptMap(nodes, [])
    expect(result.positions.size).toBe(nodes.length)
    for (const node of nodes) {
      const point = result.positions.get(node.id)!
      const panel = result.panels.find((candidate) => candidate.course === node.course)!
      expect(point.x - CONCEPT_WIDTH / 2).toBeGreaterThanOrEqual(0)
      expect(point.x + CONCEPT_WIDTH / 2).toBeLessThanOrEqual(result.width)
      expect(point.y - CONCEPT_HEIGHT / 2).toBeGreaterThan(panel.y + 40)
      expect(point.y + CONCEPT_HEIGHT / 2).toBeLessThan(panel.y + panel.height)
      for (const other of nodes.filter((candidate) => candidate.id !== node.id)) {
        const second = result.positions.get(other.id)!
        expect(Math.abs(point.x - second.x) >= CONCEPT_WIDTH || Math.abs(point.y - second.y) >= CONCEPT_HEIGHT).toBe(true)
      }
    }
  })
  it('keeps ordering stable when notes arrive in a different order', () => {
    const nodes = makeNodes(8, 'COMP2119')
    expect(layoutConceptMap(nodes, []).positions).toEqual(layoutConceptMap([...nodes].reverse(), []).positions)
  })
  it('wraps long labels without changing the underlying concept title', () => {
    for (const title of ['Minimum-node recurrence N(h)=1+N(h-1)+N(h-2)', '具体课程里的一个很长的知识点标题'.repeat(5)]) {
      const lines = conceptLabel(title)
      expect(lines.length).toBeLessThanOrEqual(2)
      expect(lines.every((line) => [...line].length <= 33)).toBe(true)
    }
  })
})
