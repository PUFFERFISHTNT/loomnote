import { strFromU8, unzipSync } from 'fflate'
import { XMLParser } from 'fast-xml-parser'

const MAX_EXPANDED_BYTES = 80 * 1024 * 1024
const MAX_OUTPUT_CHARS = 2_000_000
type Xml = Record<string, unknown>
const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: false, processEntities: true })

function parseXml(text: string): Xml {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('Documents containing XML entity declarations are not supported.')
  return parser.parse(text) as Xml
}
function named(value: unknown, tag: string): unknown[] {
  if (Array.isArray(value)) return value.flatMap((v) => named(v, tag))
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, item]) => key.startsWith('@_') ? [] : key.split(':').at(-1) === tag ? (Array.isArray(item) ? item : [item]) : named(item, tag))
}
function plain(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(plain).join('')
  if (!value || typeof value !== 'object') return ''
  return Object.entries(value).filter(([key]) => !key.startsWith('@_')).map(([key, item]) => key === 'tab' ? '\t' : key === 'br' ? '\n' : plain(item)).join('')
}
function paragraphs(xml: Xml, tag = 'p'): string {
  return named(xml, tag).map((p) => plain(p)).filter((p) => p.trim()).join('\n\n')
}

/** Office ZIP packages are read in memory; macros and embedded files never run. */
export function extractOffice(bytes: Uint8Array, extension: string): string {
  let expanded = 0, entries = 0
  const files = unzipSync(bytes, { filter: (file) => {
    expanded += file.originalSize; entries++
    if (expanded > MAX_EXPANDED_BYTES || entries > 5000) throw new Error('This Office document expands beyond the safe import limit (80 MB / 5,000 entries).')
    return /\.(?:xml|rels)$/i.test(file.name)
  } })
  const read = (name: string): Xml => {
    const data = files[name]
    if (!data) throw new Error(`Invalid Office document: missing ${name}.`)
    return parseXml(strFromU8(data))
  }
  let text: string
  if (extension === '.docx') {
    text = paragraphs(read('word/document.xml'))
  } else if (extension === '.pptx') {
    // Presentation relationships, rather than ZIP filename order, define slide order.
    const presentation = read('ppt/presentation.xml')
    const relationships = named(read('ppt/_rels/presentation.xml.rels'), 'Relationship') as Xml[]
    const slideIds = named(presentation, 'sldId') as Xml[]
    const slides = slideIds.map((slide) => {
      const relation = relationships.find((r) => r['@_Id'] === (slide['@_r:id'] ?? slide['@_id']))
      const target = relation?.['@_Target']
      if (typeof target !== 'string' || target.includes('..') || relation?.['@_TargetMode'] === 'External') throw new Error('Unsupported slide relationship in this presentation.')
      return `ppt/${target.replace(/^\/?ppt\//, '').replace(/^\//, '')}`
    })
    text = slides.map((file, i) => `[Slide ${i + 1}]\n${paragraphs(read(file))}`).join('\n\n')
  } else if (extension === '.xlsx') {
    const shared = files['xl/sharedStrings.xml'] ? named(read('xl/sharedStrings.xml'), 'si').map(plain) : []
    const workbook = read('xl/workbook.xml')
    const relationships = named(read('xl/_rels/workbook.xml.rels'), 'Relationship') as Xml[]
    const sheets = named(workbook, 'sheet') as Xml[]
    text = sheets.map((sheet, i) => {
      const rel = relationships.find((r) => r['@_Id'] === (sheet['@_r:id'] ?? sheet['@_id']))
      const target = rel?.['@_Target']
      if (typeof target !== 'string' || target.includes('..') || rel?.['@_TargetMode'] === 'External') throw new Error('Unsupported sheet relationship in this workbook.')
      const file = `xl/${target.replace(/^\/?xl\//, '').replace(/^\//, '')}`
      const rows = named(read(file), 'row').map((row) => {
        const cells = named(row, 'c') as Xml[]
        let nextColumn = 0
        const output: string[] = []
        for (const cell of cells) {
          const letters = /^([A-Z]+)/.exec(String(cell['@_r'] ?? ''))?.[1]
          const column = letters ? [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1 : nextColumn
          if (column > 16383) throw new Error('Invalid spreadsheet column.')
          const value = plain(cell['v'] ?? cell['is'] ?? '')
          const formula = cell['f'] === undefined ? '' : `=${plain(cell['f'])}`
          output[column] = String(cell['@_t'] === 's' ? shared[Number(value)] ?? '' : value || formula).replace(/[\t\n]/g, ' ')
          nextColumn = column + 1
        }
        return Array.from({ length: output.length }, (_, col) => output[col] ?? '').join('\t')
      })
      return `[Sheet ${i + 1}: ${String(sheet['@_name'] ?? `Sheet ${i + 1}`)}]\n${rows.join('\n')}`
    }).join('\n\n')
  } else {
    throw new Error('Unsupported Office document.')
  }
  if (!text.replace(/\[(?:Slide|Sheet)[^\]]*\]/g, '').trim()) throw new Error('This document has no readable text. Image-only slides need a text or image export.')
  if (text.length > MAX_OUTPUT_CHARS) throw new Error('Extracted text exceeds the 2-million-character import limit. Split the document first.')
  return text.trim()
}
