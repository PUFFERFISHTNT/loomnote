/**
 * Exporting a deck's pages into the note folder.
 *
 * The agent can only look at an image that exists as a file inside the note's
 * own folder, so this runs once per note and then stays out of the way: the
 * pages already present are reported by the main process, and only the missing
 * ones are rendered. It is deliberately resumable — closing the app halfway
 * through a 60-slide deck costs the pages that had not been drawn yet, nothing
 * more.
 *
 * @module
 */

import { openPdf, renderPageToPngBase64 } from './pdf.js'

/** Note-relative path of the image for a page. Mirrors `pageImagePath` in main. */
export function pageImagePath(page: number): string {
  return `source/pages/p${String(page).padStart(3, '0')}.png`
}

export interface ExportProgress {
  done: number
  total: number
}

export interface ExportPagesOptions {
  noteId: string
  /** Note-relative path of the deck inside the note folder. */
  relPath: string
  /** 1-based pages that already exist on disk. */
  existing: readonly number[]
  onProgress?: (progress: ExportProgress) => void
  /** Abort when the reader moves to another note. */
  signal?: AbortSignal
}

/**
 * Render every page that is not on disk yet.
 * @returns the number of pages written, and the total page count.
 */
export async function exportPages(options: ExportPagesOptions): Promise<{ written: number; total: number }> {
  const doc = await openPdf(await window.loomnote.noteReadAsset(options.noteId, options.relPath))
  try {
    const total = doc.numPages
    const have = new Set(options.existing)
    const missing: number[] = []
    for (let page = 1; page <= total; page += 1) if (!have.has(page)) missing.push(page)

    options.onProgress?.({ done: total - missing.length, total })
    let written = 0
    for (const page of missing) {
      if (options.signal?.aborted) break
      const base64 = await renderPageToPngBase64(doc, page)
      if (!base64) continue
      if (options.signal?.aborted) break
      await window.loomnote.noteWriteAsset(options.noteId, pageImagePath(page), base64)
      written += 1
      options.onProgress?.({ done: total - missing.length + written, total })
      // Yield between pages so the slide the reader is looking at keeps painting.
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    return { written, total }
  } finally {
    await doc.release()
  }
}
