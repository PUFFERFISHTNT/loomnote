import { describe, it, expect } from 'vitest'
import { parseDocument, parsePdfData } from '../src/main/parse.js'

/** 构造一个最小但合法的单页 PDF（含一个 Helvetica 文本对象），xref 偏移精确计算。 */
function makeMinimalPdf(text: string): Uint8Array {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length + 40} >>\nstream\nBT /F1 12 Tf 72 720 Td (${text}) Tj ET\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xrefStart = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  return new TextEncoder().encode(out)
}

describe('parsePdfData', () => {
  it('从最小合法 PDF 提取文本（不再乱码/空白）', async () => {
    const pdf = makeMinimalPdf('Hello LoomNote PDF 123')
    const text = await parsePdfData(pdf)
    expect(text).toContain('Hello LoomNote PDF 123')
  })
})

describe('parseDocument', () => {
  it('md/txt 直读', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const dir = mkdtempSync(join(tmpdir(), 'loomnote-'))
    const f = join(dir, 'a.md')
    writeFileSync(f, '# 标题\n正文内容')
    const r = await parseDocument(f)
    expect(r.kind).toBe('md')
    expect(r.text).toContain('正文内容')
  })

  it('不支持的类型明确报错（不再静默产生乱码笔记）', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const dir = mkdtempSync(join(tmpdir(), 'loomnote-'))
    const f = join(dir, 'x.docx')
    writeFileSync(f, 'PK\x03\x04 binary')
    await expect(parseDocument(f)).rejects.toThrow(/暂不支持/)
  })
})