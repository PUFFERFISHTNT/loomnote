import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile, rename, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { openDatabase, type AppDb } from '../src/main/db.js'
import { createStudyService } from '../src/main/study.js'
import { createWorkspace } from '../src/main/workspace.js'
import { createMergeService } from '../src/main/merge.js'
import { appendPreference, rememberedPreference } from '../src/main/preferences.js'
import { DEFAULT_SETTINGS, migrateSettings } from '../src/shared/ipc.js'

const dirs: string[] = []
const databases: AppDb[] = []
afterEach(async () => { for (const db of databases.splice(0)) db.close(); for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }) })
async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'loomnote-study-')); dirs.push(dir)
  const db = openDatabase(dir); databases.push(db)
  db.saveNote({ id: 'note', title: 'Lecture', bodyMd: '# Trees\n\n## Search\nOriginal.\n\n## Self-test\n### Q1. Why rotate?\nAnswer: Balance. (p. 4)', frontMatter: { course: 'COMP2119' }, status: 'organized', createdAt: 1, updatedAt: 1 })
  return { dir, db, workspace: createWorkspace(path.join(dir, 'workspaces')) }
}
describe('durable study workflows', () => {
  it('keeps observing note edits after an atomic file replacement', async () => {
    const { workspace } = await fixture()
    await workspace.ensure('note', 'Initial')
    const bodies: string[] = []
    const stop = workspace.watch('note', (body) => bodies.push(body))
    try {
      const replacement = workspace.fileFor('note') + '.tmp'
      await writeFile(replacement, 'Replaced')
      await rename(replacement, workspace.fileFor('note'))
      await expect.poll(() => bodies).toContain('Replaced')
      await workspace.write('note', 'Later edit')
      await expect.poll(() => bodies).toContain('Later edit')
    } finally { stop() }
  })
  it('preserves an original file named extracted.md separately from extraction', async () => {
    const { dir, workspace } = await fixture()
    const source = path.join(dir, 'extracted.md')
    await writeFile(source, 'Original bytes')
    await workspace.importSource('note', source, 'Parsed text')
    const stored = (await workspace.listSources('note'))[0]!
    expect(await readFile(path.join(workspace.dirFor('note'), stored.relPath), 'utf8')).toBe('Original bytes')
    expect(await readFile(path.join(workspace.dirFor('note'), 'source/extracted.md'), 'utf8')).toBe('Parsed text')
  })
  it('retains three review answers and their history after a database restart', async () => {
    const { dir, db } = await fixture()
    const service = createStudyService(db)
    const id = service.cards()[0]!.id
    service.rate(id, 'again'); service.rate(id, 'hard'); service.rate(id, 'good')
    db.close()
    const reopened = openDatabase(dir); databases.push(reopened)
    const restored = createStudyService(reopened)
    expect(restored.cards()[0]!.progress).toMatchObject({ repetitions: 3, lapses: 1 })
    expect(restored.cards()[0]!.progress.history).toHaveLength(3)
    expect(restored.context('note')).toContain('1 lapse(s)')
    expect(() => restored.rate(id, 'invalid' as 'good')).toThrow(/rating/)
    expect(() => restored.rate('removed', 'again')).toThrow(/removed/)
  })
  it('applies only selected changes and keeps both source files under identical names', async () => {
    const { dir, db, workspace } = await fixture()
    const first = path.join(dir, 'lecture.md')
    await writeFile(first, '## New concept\nFirst addition.')
    await workspace.importSource('note', first)
    const merges = createMergeService(db, workspace)
    const pending = await merges.prepare('note', first)
    const result = await merges.apply('note', pending.id, [pending.changes[0]!.id])
    expect(result.bodyMd.startsWith('# Trees')).toBe(true)
    expect(result.bodyMd).toContain('## New concept')
    const sources = await workspace.listSources('note')
    expect(sources).toHaveLength(2)
    expect(new Set(sources.map((s) => s.relPath)).size).toBe(2)
    expect((await workspace.describeSource('note'))?.kind).toBe('other')
    expect(db.listNotes()[0]!.course).toBe('COMP2119')
  })
  it('refuses a merge if the note or source changes after review', async () => {
    const { dir, db, workspace } = await fixture()
    const file = path.join(dir, 'more.md'); await writeFile(file, '## More\nText')
    const merges = createMergeService(db, workspace)
    const pending = await merges.prepare('note', file)
    await workspace.write('note', 'New work')
    await expect(merges.apply('note', pending.id, [pending.changes[0]!.id])).rejects.toThrow(/note changed/)
    await workspace.write('note', pending.baseBody)
    await writeFile(file, 'Changed source')
    await expect(merges.apply('note', pending.id, [pending.changes[0]!.id])).rejects.toThrow(/source file changed/)
  })
  it('saves explicit preferences and migrates them across restart without an extra service', async () => {
    expect(rememberedPreference('Remember: use inline formulas')).toBe('use inline formulas')
    expect(rememberedPreference('记住：公式用行内格式')).toBe('公式用行内格式')
    expect(rememberedPreference('Explain the formula')).toBeNull()
    expect(appendPreference('- use inline formulas', 'use inline formulas')).toBe('- use inline formulas')
    const { dir, db } = await fixture()
    db.setSetting('settings', JSON.stringify({ ...DEFAULT_SETTINGS, studyPreferences: '- use inline formulas' }))
    db.close()
    const reopened = openDatabase(dir); databases.push(reopened)
    expect(migrateSettings(JSON.parse(reopened.getSetting('settings')!)).studyPreferences).toBe('- use inline formulas')
  })
})
