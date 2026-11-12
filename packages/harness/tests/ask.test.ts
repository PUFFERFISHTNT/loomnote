import { describe, expect, it } from 'vitest'
import { extractAsk, stripAsk } from '../src/ask.js'

const question = (body: string): string => `Here is the note plan.\n\n\`\`\`loomnote:ask\n${body}\n\`\`\`\n`

describe('in-band questions', () => {
  it('reads a question and its options', () => {
    const parsed = extractAsk(question('{"question":"Which section should move?","options":[{"label":"Animate the queue","detail":"It has an order of events"},{"label":"Leave it as text"}]}'))
    expect(parsed).toEqual({
      question: 'Which section should move?',
      options: [{ label: 'Animate the queue', detail: 'It has an order of events' }, { label: 'Leave it as text' }]
    })
  })

  it('accepts bare strings as options', () => {
    expect(extractAsk(question('{"question":"Continue?","options":["Yes","No"]}'))?.options).toEqual([{ label: 'Yes' }, { label: 'No' }])
  })

  it('ignores a block that is not a question', () => {
    expect(extractAsk('```ts\nconst a = 1\n```')).toBeNull()
    expect(extractAsk('no fence here')).toBeNull()
  })

  it('rejects malformed, too-small and oversized questions', () => {
    expect(extractAsk(question('not json'))).toBeNull()
    expect(extractAsk(question('{"options":["a","b"]}'))).toBeNull()
    expect(extractAsk(question('{"question":"x","options":["only-one"]}'))).toBeNull()
    expect(extractAsk(question(JSON.stringify({ question: 'q'.repeat(500), options: ['a', 'b'] })))).toBeNull()
  })

  it('caps the number of options rather than rendering an unbounded list', () => {
    const many = JSON.stringify({ question: 'pick', options: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] })
    expect(extractAsk(question(many))?.options).toHaveLength(5)
  })

  it('removes the block from the visible answer', () => {
    const text = question('{"question":"Which?","options":["a","b"]}')
    expect(stripAsk(text)).toBe('Here is the note plan.')
  })

  it('leaves an ordinary answer untouched', () => {
    expect(stripAsk('Just prose.\n\nMore prose.')).toBe('Just prose.\n\nMore prose.')
  })
})
