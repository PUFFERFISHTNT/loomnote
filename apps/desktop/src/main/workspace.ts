/**
 * The note working directory.
 *
 * Every note owns a folder holding `note.md`. That file — not a string in a
 * database column — is what the agent reads and edits, which is what makes a
 * small request produce a small change: the harness's own `edit` tool rewrites
 * the lines that differ and nothing else. The database keeps the canonical copy
 * for the list, the search and the history; this folder is the live surface
 * both the agent and the reader look at.
 *
 * @module
 */

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { NOTE_FILENAME } from '@loomnote/harness'

/** Debounce for filesystem notifications; an edit streams many of them. */
const WATCH_DEBOUNCE_MS = 120

/** What a note's `source/` folder holds, as far as the app needs to know. */
export interface NoteSource {
  /** File name of the original document. */
  name: string
  /** `pdf` when the note came from a lecture deck, `other` otherwise. */
  kind: 'pdf' | 'image' | 'other'
  /** Page images already exported, as 1-based page numbers, ascending. */
  pages: number[]
  relPath: string
  pagesPath: string
}

export interface NoteWorkspace {
  /** Directory the agent runs in for this note. Created on demand. */
  dirFor(noteId: string): string
  /** Absolute path of the note file. */
  fileFor(noteId: string): string
  /** Create the folder and write a seed body when the file does not exist yet. */
  ensure(noteId: string, seed: string): Promise<string>
  /** Read the note file, or an empty string when it does not exist. */
  read(noteId: string): Promise<string>
  /** Replace the note file (used when the app, not the agent, owns the write). */
  write(noteId: string, body: string): Promise<void>
  /**
   * Watch a note for changes.
   * @returns an unwatch function.
   */
  watch(noteId: string, onChange: (body: string) => void): () => void
  /** Remove a note's folder. */
  remove(noteId: string): Promise<void>

  /**
   * Copy an imported document into the note as `source/<name>`.
   *
   * Keeping the original next to the note is what lets the reader look at the
   * actual deck rather than the text we scraped out of it, and what gives the
   * agent page images it can see.
   */
  importSource(noteId: string, filePath: string, text?: string): Promise<{ name: string; kind: 'pdf' | 'image' | 'other' }>
  /** Describe the note's `source/` folder, or null when the note has none. */
  describeSource(noteId: string): Promise<NoteSource | null>
  listSources(noteId: string): Promise<NoteSource[]>
  importAdditionalSource(noteId: string, sourceId: string, filePath: string, text: string): Promise<void>
  /** Write a note-relative asset (page images, figures) from base64 bytes. */
  writeAsset(noteId: string, relPath: string, base64: string): Promise<void>
  /** Resolve a note-relative path, refusing anything outside the note folder. */
  resolveAsset(noteId: string, relPath: string): string | null
}

/**
 * Build a workspace rooted at `root`.
 * @param root - parent directory for every note folder.
 */
export function createWorkspace(root: string): NoteWorkspace {
  const dirFor = (noteId: string): string => path.join(root, safeSegment(noteId))

  /** Resolve a note-relative path, or null when it would escape the note folder. */
  const resolveAsset = (noteId: string, relPath: string): string | null => {
    const noteRoot = path.resolve(dirFor(noteId))
    const target = path.resolve(noteRoot, relPath)
    // A `..` in a model-written Markdown path must never reach the rest of the disk.
    return target === noteRoot || target.startsWith(noteRoot + path.sep) ? target : null
  }

  async function describeFolder(noteId: string, relDir: string): Promise<NoteSource | null> {
    const dir = path.join(dirFor(noteId), relDir)
    let entries: import('node:fs').Dirent[]
    try { entries = await fsp.readdir(dir, { withFileTypes: true }) } catch { return null }
    const document = entries.find((entry) => entry.isFile() && !entry.name.startsWith('.') && entry.name !== 'extracted.md')
    if (!document) return null
    let pages: number[] = []
    try {
      pages = (await fsp.readdir(path.join(dir, PAGES_DIR))).flatMap((file) => {
        const match = /^p(\d+)\.png$/.exec(file)
        return match ? [Number(match[1])] : []
      }).sort((a, b) => a - b)
    } catch { /* No rendered pages yet. */ }
    return { name: document.name, kind: sourceKind(document.name), pages,
      relPath: `${relDir}/${document.name}`, pagesPath: `${relDir}/${PAGES_DIR}` }
  }

  return {
    dirFor,
    fileFor: (noteId) => path.join(dirFor(noteId), NOTE_FILENAME),

    async ensure(noteId, seed) {
      const dir = dirFor(noteId)
      await fsp.mkdir(dir, { recursive: true })
      const file = path.join(dir, NOTE_FILENAME)
      try {
        await fsp.access(file)
      } catch {
        await fsp.writeFile(file, seed, 'utf8')
      }
      return file
    },

    async read(noteId) {
      try {
        return await fsp.readFile(path.join(dirFor(noteId), NOTE_FILENAME), 'utf8')
      } catch {
        return ''
      }
    },

    async write(noteId, body) {
      const dir = dirFor(noteId)
      await fsp.mkdir(dir, { recursive: true })
      await fsp.writeFile(path.join(dir, NOTE_FILENAME), body, 'utf8')
    },

    watch(noteId, onChange) {
      const file = path.join(dirFor(noteId), NOTE_FILENAME)
      let timer: NodeJS.Timeout | undefined
      let last = ''
      let disposed = false
      const fire = (): void => {
        if (disposed) return
        void fsp
          .readFile(file, 'utf8')
          .then((body) => {
            if (body === last) return
            last = body
            onChange(body)
          })
          .catch(() => undefined)
      }
      let watcher: fs.FSWatcher | null = null
      let polling: NodeJS.Timeout | undefined
      const poll = (): void => {
        watcher?.close(); watcher = null
        if (polling || disposed) return
        // Sandboxed hosts and exhausted OS watcher quotas can reject fs.watch.
        // Read periodically rather than waiting for a stat baseline: an atomic
        // replacement before the first stat must still reach the preview.
        polling = setInterval(fire, 250)
        polling.unref()
        fire()
      }
      try {
        // Editors and agent tools may replace note.md atomically; watching its
        // parent keeps notifications alive after the original inode disappears.
        watcher = fs.watch(path.dirname(file), { persistent: false }, (_, name) => {
          if (name && name.toString() !== NOTE_FILENAME) return
          if (timer) clearTimeout(timer)
          timer = setTimeout(fire, WATCH_DEBOUNCE_MS)
        })
        watcher.on('error', poll)
        // macOS may coalesce an edit made immediately after registration.
        timer = setTimeout(fire, WATCH_DEBOUNCE_MS)
      } catch {
        poll()
      }
      return () => {
        disposed = true
        if (timer) clearTimeout(timer)
        watcher?.close()
        if (polling) clearInterval(polling)
      }
    },

    async remove(noteId) {
      await fsp.rm(dirFor(noteId), { recursive: true, force: true })
    },

    async importSource(noteId, filePath, text) {
      const name = sourceName(filePath)
      const dir = path.join(dirFor(noteId), SOURCE_DIR)
      await fsp.mkdir(dir, { recursive: true })
      await fsp.copyFile(filePath, path.join(dir, name))
      if (text !== undefined) await fsp.writeFile(path.join(dir, 'extracted.md'), text, 'utf8')
      return { name, kind: sourceKind(name) }
    },

    describeSource(noteId) {
      return describeFolder(noteId, SOURCE_DIR)
    },

    async listSources(noteId) {
      const primary = await describeFolder(noteId, SOURCE_DIR)
      let folders: string[] = []
      try { folders = await fsp.readdir(path.join(dirFor(noteId), SOURCE_DIR, 'lectures')) } catch { /* No additional decks. */ }
      const extra = await Promise.all(folders.map((id) => describeFolder(noteId, `${SOURCE_DIR}/lectures/${safeSegment(id)}`)))
      return [primary, ...extra].filter((s): s is NoteSource => s !== null)
    },

    async importAdditionalSource(noteId, sourceId, filePath, text) {
      const dir = path.join(dirFor(noteId), SOURCE_DIR, 'lectures', safeSegment(sourceId))
      await fsp.mkdir(dir, { recursive: true })
      await fsp.copyFile(filePath, path.join(dir, sourceName(filePath)))
      await fsp.writeFile(path.join(dir, 'extracted.md'), text, 'utf8')
    },

    async writeAsset(noteId, relPath, base64) {
      const target = resolveAsset(noteId, relPath)
      if (!target) throw new Error(`refusing to write outside the note folder: ${relPath}`)
      await fsp.mkdir(path.dirname(target), { recursive: true })
      await fsp.writeFile(target, Buffer.from(base64, 'base64'))
    },

    resolveAsset
  }
}

/** Folder holding the imported lecture. */
export const SOURCE_DIR = 'source'
/** Folder holding one PNG per PDF page, written by the renderer. */
export const PAGES_DIR = 'pages'

/**
 * Path of a page image inside a note, relative to the note folder.
 * @param page - 1-based page number.
 */
export function pageImagePath(page: number): string {
  return `${SOURCE_DIR}/${PAGES_DIR}/p${String(page).padStart(3, '0')}.png`
}

/** Keep a note id from escaping the workspace root. */
function safeSegment(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, '_')
}

function sourceKind(name: string): 'pdf' | 'image' | 'other' {
  const ext = path.extname(name).toLowerCase()
  return ext === '.pdf' ? 'pdf' : ['.png', '.jpg', '.jpeg', '.webp'].includes(ext) ? 'image' : 'other'
}

function sourceName(filePath: string): string {
  const name = path.basename(filePath)
  return name.toLowerCase() === 'extracted.md' ? 'original-extracted.md' : name
}
