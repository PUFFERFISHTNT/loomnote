import { describe, expect, it } from 'vitest'
import { applyMerge, buildNoteGraph, extractStudyQuestions, proposeMerge, scheduleReview, type Note } from '../src/index.js'

const note = (bodyMd: string, id = 'n', course = 'COMP2119'): Note => ({ id, title: `Lecture ${id}`, bodyMd, frontMatter: { course, tags: ['trees'] }, status: 'organized', createdAt: 1, updatedAt: 1 })

describe('review questions and scheduling', () => {
  it('extracts each answer and its page without swallowing the next section', () => {
    const cards = extractStudyQuestions(note('## Self-test\n### Q1. Why rotate?\nAnswer: To rebalance. (Lecture 8, p. 12)\n### Q2. What stays?\nAnswer: Inorder. (p. 14)\n## References\nnot an answer'))
    expect(cards).toHaveLength(2)
    expect(cards[0]).toMatchObject({ question: 'Why rotate?', answer: 'To rebalance. (Lecture 8, p. 12)', page: 12 })
    expect(cards[1]!.answer).not.toContain('References')
  })
  it('keeps ids stable when questions move or their answers change', () => {
    const first = extractStudyQuestions(note('## Self-test\n1. Why?\nAnswer: A\n2. How?\nAnswer: B'))
    const second = extractStudyQuestions(note('## Self-test\n1. How?\nAnswer: C\n2. Why?\nAnswer: D'))
    expect(first[0]!.id).toBe(second[1]!.id)
    expect(first[1]!.id).toBe(second[0]!.id)
  })
  it('reads Chinese self-test sections and ignores fenced question examples', () => {
    const cards = extractStudyQuestions(note('## 自测\n```md\n1. Example\n```\n### Q1. 为什么？\n答案：平衡树。（第 12 页）'))
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ answer: '平衡树。（第 12 页）', page: 12 })
  })
  it('reschedules failures in ten minutes and remembers lapses and history', () => {
    const good = scheduleReview(undefined, 'good', 1000)
    const again = scheduleReview(good, 'again', 2000)
    expect(good.dueAt).toBe(1000 + 86_400_000)
    expect(again).toMatchObject({ dueAt: 602000, repetitions: 2, lapses: 1, intervalDays: 0 })
    expect(again.history.map((h) => h.rating)).toEqual(['good', 'again'])
    expect(scheduleReview(good, 'easy', 2000).intervalDays).toBeGreaterThan(good.intervalDays)
  })
})

describe('reviewable incremental merge', () => {
  const base = '# Trees\n\n## Search\nExisting explanation.\n\n## Rotation\nKeep this byte for byte.\n'
  it('skips exact sections, proposes updates and additions, and preserves unselected text', () => {
    const changes = proposeMerge(base, '# Lecture 2\n\n## Search\nNew explanation.\n\n## Rotation\nKeep this byte for byte.\n\n## Deletion\nNew material.\n', 'Lecture 2')
    expect(changes.map((c) => c.kind)).toEqual(['update', 'skip', 'add'])
    const merged = applyMerge(base, changes, [changes[2]!.id])
    expect(merged.startsWith(base)).toBe(true)
    expect(merged).toContain('## Deletion')
    expect(merged).not.toContain('New explanation.')
    const updated = applyMerge(base, changes, [changes[0]!.id])
    expect(updated).toContain('New explanation.')
    expect(updated).toContain('## Rotation\nKeep this byte for byte.\n')
  })
  it('rejects a stale update instead of overwriting new changes', () => {
    const changes = proposeMerge(base, '## Search\nNew explanation.', 'More')
    expect(() => applyMerge(base.replace('Existing', 'Changed'), changes, [changes[0]!.id])).toThrow(/changed/)
  })
})

describe('course concept maps', () => {
  it('extracts knowledge points, merges the same concept across lectures, and isolates courses', () => {
    const graph = buildNoteGraph([
      note('## Balanced trees\n### AVL rotations\n## Self-test\n### Q1. Why?\nAnswer: …'),
      note('## Balanced trees\n[[Lecture n]]', 'b'),
      note('## Balanced trees\n[[Lecture n]]', 'other', 'MATH1011')
    ])
    expect(graph.courses).toEqual(['COMP2119', 'MATH1011'])
    expect(graph.nodes).toHaveLength(3)
    expect(graph.nodes.some((n) => n.title.startsWith('Q1'))).toBe(false)
    expect(graph.nodes.find((n) => n.course === 'COMP2119' && n.title === 'Balanced trees')!.sources).toHaveLength(2)
    expect(graph.edges.some((e) => e.kind === 'contains')).toBe(true)
    for (const edge of graph.edges) expect(graph.nodes.find((n) => n.id === edge.from)!.course).toBe(graph.nodes.find((n) => n.id === edge.to)!.course)
  })
  it('ignores code examples and demo HTML headings', () => {
    const graph = buildNoteGraph([note('```md\n## Fake\n```\n:::demo Test\n## Also fake\n:::\n## Real')])
    expect(graph.nodes.map((n) => n.title)).toEqual(['Real'])
  })
  it('uses concrete structured knowledge, citations and explicit relationships rather than file nodes', () => {
    const body = '## Overview\nIntro\n## Self-test\n### Q1. What?\nAnswer: A\n<!-- loomnote:concepts '+ JSON.stringify({ concepts: [
      { title: 'Balance factor', description: 'Left subtree height minus right subtree height.', page: 3, heading: 'AVL balance' },
      { title: 'Right rotation', description: 'Promote the left child and preserve inorder order.', page: 12 }
    ], relations: [ { from: 'Balance factor', to: 'Right rotation', label: 'determines when to apply' }, { from: 'Balance factor', to: 'Invented point', label: 'not resolved' } ] }) +' -->'
    const graph = buildNoteGraph([note(body)])
    expect(graph.nodes.map((n) => n.title)).toEqual(['Balance factor', 'Right rotation'])
    expect(graph.nodes[0]).toMatchObject({ description: 'Left subtree height minus right subtree height.', sources: [{ noteId: 'n', page: 3, heading: 'AVL balance' }] })
    expect(graph.edges).toHaveLength(1)
    expect(graph.edges[0]!.label).toBe('determines when to apply')
    expect(extractStudyQuestions(note(body))[0]!.answer).toBe('A')
  })
  it('falls back safely on malformed metadata and reads bold definitions', () => {
    const graph = buildNoteGraph([note('## Probability\n- **Independence**: P(A and B) = P(A)P(B).\n<!-- loomnote:concepts {broken} -->')])
    expect(graph.nodes.map((n) => n.title)).toEqual(['Probability', 'Independence'])
    expect(graph.nodes[1]!.description).toContain('P(A)P(B)')
    expect(graph.edges).toHaveLength(1)
  })
})
