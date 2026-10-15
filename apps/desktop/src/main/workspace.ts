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
  kind: 'pdf' | 'other'
  /** Page images already exported, as 1-based page numbers, ascending. */
  pages: number[]
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
  importSource(noteId: string, filePath: string): Promise<{ name: string; kind: 'pdf' | 'other' }>
  /** Describe the note's `source/` folder, or null when the note has none. */
  describeSource(noteId: string): Promise<NoteSource | null>
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
      const fire = (): void => {
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
      try {
        watcher = fs.watch(file, { persistent: false }, () => {
          if (timer) clearTimeout(timer)
          timer = setTimeout(fire, WATCH_DEBOUNCE_MS)
        })
      } catch {
        // The file may not exist yet; the caller calls ensure() first.
        watcher = null
      }
      return () => {
        if (timer) clearTimeout(timer)
        watcher?.close()
      }
    },

    async remove(noteId) {
      await fsp.rm(dirFor(noteId), { recursive: true, force: true })
    },

    async importSource(noteId, filePath) {
      const name = path.basename(filePath)
      const dir = path.join(dirFor(noteId), SOURCE_DIR)
      await fsp.mkdir(dir, { recursive: true })
      await fsp.copyFile(filePath, path.join(dir, name))
      return { name, kind: path.extname(name).toLowerCase() === '.pdf' ? 'pdf' : 'other' }
    },

    async describeSource(noteId) {
      const dir = path.join(dirFor(noteId), SOURCE_DIR)
      let entries: string[]
      try {
        entries = await fsp.readdir(dir)
      } catch {
        return null
      }
      const document = entries.find((entry) => !entry.startsWith('.'))
      if (!document) return null
      let pages: number[] = []
      try {
        pages = (await fsp.readdir(path.join(dir, PAGES_DIR)))
          .map((file) => /^p(\d+)\.png$/.exec(file)?.[1])
          .filter((n): n is string => Boolean(n))
          .map((n) => Number(n))
          .sort((a, b) => a - b)
      } catch {
        pages = []
      }
      return { name: document, kind: path.extname(document).toLowerCase() === '.pdf' ? 'pdf' : 'other', pages }
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
