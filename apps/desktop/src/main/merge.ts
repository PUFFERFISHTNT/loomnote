import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { applyMerge, parseFrontMatter, proposeMerge, type Note } from '@loomnote/core'
import type { MergeProposal } from '../shared/ipc.js'
import type { AppDb } from './db.js'
import type { NoteWorkspace } from './workspace.js'
import { parseDocument } from './parse.js'

const checksum = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
interface PendingMerge extends MergeProposal { sourcePath: string; checksum: string; sourceText: string }

export function createMergeService(db: AppDb, workspace: NoteWorkspace) {
  return {
    async prepare(noteId: string, sourcePath: string): Promise<MergeProposal> {
      const note = db.getNote(noteId)
      if (!note) throw new Error('Open an existing note before merging a lecture.')
      const bytes = await readFile(sourcePath)
      const parsed = await parseDocument(sourcePath)
      const incoming = parseFrontMatter(parsed.text).body
      const baseBody = await workspace.read(noteId) || note.bodyMd
      const id = randomUUID()
      const proposal: PendingMerge = {
        id, noteId, baseBody, sourceName: path.basename(sourcePath),
        sourcePath, checksum: checksum(bytes), sourceText: parsed.text,
        changes: proposeMerge(baseBody, incoming, parsed.title)
      }
      db.setSetting(`pending-merge:${noteId}`, JSON.stringify(proposal))
      const { sourcePath: _path, checksum: _hash, sourceText: _text, ...visible } = proposal
      return visible
    },
    async apply(noteId: string, proposalId: string, selected: string[]): Promise<Note> {
      const raw = db.getSetting(`pending-merge:${noteId}`)
      const pending = raw ? JSON.parse(raw) as PendingMerge : null
      if (!pending || pending.id !== proposalId) throw new Error('This merge proposal expired. Prepare it again.')
      const note = db.getNote(noteId)
      if (!note) throw new Error('The note no longer exists.')
      const current = await workspace.read(noteId) || note.bodyMd
      if (current !== pending.baseBody) throw new Error('The note changed since this proposal. Prepare the merge again to preserve the latest edits.')
      if (!selected.length || selected.some((id) => !pending.changes.some((c) => c.id === id && c.kind !== 'skip'))) throw new Error('Choose at least one addition or update to apply.')
      const bytes = await readFile(pending.sourcePath)
      if (checksum(bytes) !== pending.checksum) throw new Error('The source file changed. Prepare the merge again.')
      const bodyMd = applyMerge(current, pending.changes, selected)
      // Store each additional deck separately: identical filenames never replace an earlier lecture.
      await workspace.importAdditionalSource(noteId, pending.id, pending.sourcePath, pending.sourceText)
      const updated: Note = { ...note, bodyMd, updatedAt: Date.now() }
      await workspace.write(noteId, bodyMd)
      db.saveNote(updated)
      db.setSetting(`pending-merge:${noteId}`, '')
      return updated
    }
  }
}
