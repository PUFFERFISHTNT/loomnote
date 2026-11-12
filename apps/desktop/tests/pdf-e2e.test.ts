import { describe, it, expect } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { tmpdir } from 'node:os'
import { parsePdfFile } from '../src/main/parse.js'

/**
 * The PDF path, exercised against a real multi-page deck.
 *
 * A genuine lecture deck is the student's own material and is not committed, so
 * this test takes its inputs from two places and skips when neither supplies
 * one:
 *
 *   LOOMNOTE_TEST_PDFS=/path/a.pdf:/path/b.pdf   (a local run)
 *   apps/desktop/tests/fixtures/*.pdf            (a deck anyone may redistribute)
 *
 * It used to hard-code two absolute paths from one machine, which made it pass
 * only there and quietly publish a directory layout that is nobody else's
 * business.
 */
function samplePdfs(): string[] {
  const fromEnv = (process.env['LOOMNOTE_TEST_PDFS'] ?? '')
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
  const fixtures = join(import.meta.dirname, 'fixtures')
  let fromFixtures: string[] = []
  try {
    fromFixtures = readdirSync(fixtures)
      .filter((name) => name.toLowerCase().endsWith('.pdf'))
      .map((name) => join(fixtures, name))
  } catch {
    fromFixtures = []
  }
  return [...fromEnv, ...fromFixtures].filter((file) => existsSync(file))
}

/** Build a small but valid single-page PDF, so the suite always has one input. */
function writeFixturePdf(target: string, lines: string[]): void {
  const text = lines.map((line, index) => `BT /F1 12 Tf 72 ${720 - index * 18} Td (${line}) Tj ET`).join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length + 40} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(out.length)
    out += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xrefStart = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  writeFileSync(target, Buffer.from(out, 'latin1'))
}

const samples = samplePdfs()
const generated: string[] = []

describe('PDF parsing end to end', () => {
  for (const file of samples) {
    it(`reads a real deck — ${file.split('/').pop()}`, async () => {
      const text = await parsePdfFile(file)
      expect(text.length).toBeGreaterThan(1000)
      // Real academic prose, not mojibake or a blank page.
      expect(text).toMatch(/[A-Za-z]{4,}/)
    })
  }

  it('reads a generated multi-line deck when no lecture of your own is configured', async () => {
    if (samples.length > 0) return
    const dir = mkdtempSync(join(tmpdir(), 'loomnote-pdf-'))
    const file = join(dir, 'generated-deck.pdf')
    writeFixturePdf(file, [
      'Balanced Trees: maintaining short search paths.',
      "An AVL tree keeps every balance factor within minus one and one.",
      'A rotation preserves the inorder sequence of the keys.'
    ])
    generated.push(file)
    const text = await parsePdfFile(file)
    expect(text).toContain('AVL')
    expect(text).toContain('rotation')
  })
})
