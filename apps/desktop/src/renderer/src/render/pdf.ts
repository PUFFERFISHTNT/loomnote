/**
 * PDF rendering, in the renderer.
 *
 * Two jobs share one engine. The slide view draws the deck as it actually looks
 * — the reader asked for the lecture, not for our extraction of it. The page
 * exporter rasterises every page into the note folder once, so the agent can
 * *look* at a diagram with its own eyes instead of reading a caption about it.
 *
 * pdf.js runs on a worker so a 50-page deck never blocks the UI thread.
 *
 * @module
 */

import * as pdfjs from 'pdfjs-dist'
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker'

pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker()

/**
 * One opened document.
 *
 * pdf.js v6 has no `destroy` on the document proxy — the loading task owns the
 * worker and the transport — so the handle keeps both together. Callers must
 * release it, or a reader who clicks through twenty notes leaves twenty workers
 * behind.
 */
export interface OpenPdf {
  readonly doc: pdfjs.PDFDocumentProxy
  /** Tear down the worker and every request the document still owns. */
  release(): Promise<void>
  /** Page count, available as soon as the document is open. */
  readonly numPages: number
}

/** Width, in device pixels, used when rasterising pages for the agent. */
export const PAGE_EXPORT_WIDTH = 1400

/**
 * Open a PDF from bytes.
 *
 * Bytes rather than a URL on purpose: the window's origin is `file://`, and
 * Chromium refuses a cross-origin request from it to a private scheme, so a
 * `loomnote-asset://` fetch of the deck is blocked before it leaves the app.
 *
 * @param data - the document's bytes.
 */
export async function openPdf(data: Uint8Array): Promise<OpenPdf> {
  const task = pdfjs.getDocument({ data, disableAutoFetch: true })
  const doc = await task.promise
  return {
    doc,
    numPages: doc.numPages,
    release: async () => {
      await task.destroy()
    }
  }
}

/** The render in flight per canvas, so a newer one can cancel the older. */
const activeRenders = new WeakMap<HTMLCanvasElement, { cancel(): void }>()

export interface RenderedPage {
  /** CSS pixels. */
  width: number
  height: number
}

/**
 * Draw one page into a canvas at a fit-to-width scale.
 * @param doc - open document.
 * @param pageNumber - 1-based page number.
 * @param canvas - destination canvas; resized here.
 * @param targetWidth - CSS pixel width to fit.
 * @returns the rendered page's CSS size.
 */
export async function renderPageToCanvas(doc: OpenPdf, pageNumber: number, canvas: HTMLCanvasElement, targetWidth: number): Promise<RenderedPage> {
  const page = await doc.doc.getPage(pageNumber)
  const base = page.getViewport({ scale: 1 })
  const scale = Math.max(0.1, targetWidth / base.width)
  const viewport = page.getViewport({ scale })
  const dpr = Math.min(window.devicePixelRatio || 1, 2)

  canvas.width = Math.floor(viewport.width * dpr)
  canvas.height = Math.floor(viewport.height * dpr)
  canvas.style.width = `${Math.floor(viewport.width)}px`
  canvas.style.height = `${Math.floor(viewport.height)}px`

  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas 2d context unavailable')
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, viewport.width, viewport.height)

  // pdf.js refuses to render two pages onto one canvas at once, and React can
  // start a second render before the first settles (a resize, or a strict-mode
  // double effect). Cancelling the in-flight task for this canvas keeps the
  // viewer's own output instead of an error page.
  activeRenders.get(canvas)?.cancel()
  const task = page.render({ canvas, canvasContext: context, viewport })
  activeRenders.set(canvas, task)
  try {
    await task.promise
  } finally {
    if (activeRenders.get(canvas) === task) activeRenders.delete(canvas)
  }
  page.cleanup()
  return { width: viewport.width, height: viewport.height }
}

/**
 * Rasterise one page to PNG bytes, sized for a language model rather than a
 * printer: wide enough to keep labels legible, small enough to be worth reading.
 * @param doc - open document.
 * @param pageNumber - 1-based page number.
 * @returns base64 PNG bytes, without a data-URL prefix.
 */
export async function renderPageToPngBase64(doc: OpenPdf, pageNumber: number): Promise<string> {
  const page = await doc.doc.getPage(pageNumber)
  const base = page.getViewport({ scale: 1 })
  const scale = Math.max(0.5, Math.min(3, PAGE_EXPORT_WIDTH / base.width))
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas 2d context unavailable')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, viewport.width, viewport.height)

  await page.render({ canvas, canvasContext: context, viewport }).promise
  page.cleanup()

  const url = canvas.toDataURL('image/png')
  const comma = url.indexOf(',')
  return comma < 0 ? '' : url.slice(comma + 1)
}
