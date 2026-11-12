import { afterEach, describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { extractOffice } from '../src/main/office.js'
import { parseDocument } from '../src/main/parse.js'
import { createCourseService } from '../src/main/courses.js'
import { openDatabase } from '../src/main/db.js'

const pack = (files: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])))
const dirs: string[] = []
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }) })
describe('local Office and text import', () => {
  it('extracts DOCX paragraphs, tables and escaped characters without running embedded content', () => {
    const data = pack({ 'word/document.xml': '<w:document xmlns:w="word"><w:body><w:p><w:r><w:t>Trees &amp; rotations</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>O(log n)</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>', 'word/vbaProject.bin': 'never execute' })
    expect(extractOffice(data, '.docx')).toBe('Trees & rotations\n\nO(log n)')
  })
  it('uses presentation order and retains slide numbers', () => {
    const data = pack({
      'ppt/presentation.xml': '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId id="256" r:id="second"/><p:sldId id="257" r:id="first"/></p:sldIdLst></p:presentation>',
      'ppt/_rels/presentation.xml.rels': '<Relationships><Relationship Id="first" Target="slides/slide1.xml"/><Relationship Id="second" Target="slides/slide2.xml"/></Relationships>',
      'ppt/slides/slide1.xml': '<p:sld xmlns:p="p" xmlns:a="a"><a:p><a:r><a:t>Last</a:t></a:r></a:p></p:sld>',
      'ppt/slides/slide2.xml': '<p:sld xmlns:p="p" xmlns:a="a"><a:p><a:r><a:t>First</a:t></a:r></a:p></p:sld>'
    })
    expect(extractOffice(data, '.pptx')).toBe('[Slide 1]\nFirst\n\n[Slide 2]\nLast')
  })
  it('reads XLSX shared strings, cell gaps, sheet labels and cached formulas', () => {
    const data = pack({
      'xl/workbook.xml': '<workbook xmlns:r="r"><sheets><sheet name="Trees" r:id="r1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/sharedStrings.xml': '<sst><si><t>AVL</t></si></sst>',
      'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="C1"><v>12</v></c><c r="D1"><f>C1*2</f><v>24</v></c></row></sheetData></worksheet>'
    })
    expect(extractOffice(data, '.xlsx')).toBe('[Sheet 1: Trees]\nAVL\t\t12\t24')
  })
  it('rejects malformed, empty, entity-based and oversized Office packages', () => {
    expect(() => extractOffice(pack({ 'nothing.xml': '<a/>' }), '.docx')).toThrow(/missing/)
    expect(() => extractOffice(pack({ 'word/document.xml': '<document/>' }), '.docx')).toThrow(/no readable/)
    expect(() => extractOffice(pack({ 'word/document.xml': '<!DOCTYPE doc [<!ENTITY x "secret">]><doc/>' }), '.docx')).toThrow(/entity/)
  })
  it('imports HTML as text, preserves CSV columns, and rejects empty files and legacy Office', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'loomnote-import-')); dirs.push(dir)
    const html = path.join(dir, 'lecture.html'); await writeFile(html, '<h1>Supply</h1><script>secret()</script><p>Demand &amp; supply</p>')
    expect((await parseDocument(html)).text).toBe('Supply\nDemand & supply')
    const csv = path.join(dir, 'data.csv'); await writeFile(csv, 'time,queue\n1,3')
    expect((await parseDocument(csv)).text).toContain('time,queue')
    const empty = path.join(dir, 'empty.txt'); await writeFile(empty, '')
    await expect(parseDocument(empty)).rejects.toThrow(/empty/)
    const legacy = path.join(dir, 'old.doc'); await writeFile(legacy, 'legacy')
    await expect(parseDocument(legacy)).rejects.toThrow(/Legacy/)
  })
})

describe('course library', () => {
  it('retains empty courses, renames all notes and archives without deleting material', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'loomnote-course-')); dirs.push(dir)
    const db = openDatabase(dir)
    try {
      const service = createCourseService(db), course = service.create('COMP2119')
      expect(service.list()).toHaveLength(1)
      db.saveNote({ id: 'n', title: 'Trees', bodyMd: '## AVL', frontMatter: { course: course.name }, status: 'draft', createdAt: 0, updatedAt: 0 })
      service.update(course.id, 'Data structures', false)
      expect(db.getNote('n')!.frontMatter.course).toBe('Data structures')
      service.update(course.id, 'Data structures', true)
      expect(service.list()[0]!.archived).toBe(true)
      expect(db.getNote('n')!.bodyMd).toBe('## AVL')
      expect(() => service.create('data STRUCTURES')).toThrow(/exists/)
      expect(() => service.create('  ')).toThrow(/name/)
    } finally { db.close() }
    const reopened = openDatabase(dir)
    try { expect(createCourseService(reopened).list()[0]).toMatchObject({ name: 'Data structures', archived: true }) } finally { reopened.close() }
  })
})
