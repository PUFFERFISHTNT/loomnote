/**
 * The slide view: the lecture as it actually looks.
 *
 * A note is written *from* a deck, and the deck is often the clearer artefact —
 * a diagram, a worked table, a picture the extraction turned into a paragraph of
 * stray labels. This shows the original pages next to the note so a reader can
 * check one against the other.
 *
 * @module
 */

import { useEffect, useRef, useState } from 'react'
import { openPdf, renderPageToCanvas, type OpenPdf } from '../render/pdf.js'
import { t, useLang } from '../i18n.js'

export interface PdfViewerProps {
  /** Note that owns the deck. */
  noteId: string
  /** Note-relative path of the deck. */
  relPath: string
  /** Page to open on; changing it scrolls this viewer. */
  page?: number
  onPageCount?: (total: number) => void
}

export function PdfViewer({ noteId, relPath, page, onPageCount }: PdfViewerProps) {
  const [doc, setDoc] = useState<OpenPdf | null>(null)
  const [current, setCurrent] = useState(page ?? 1)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const holderRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(760)
  useLang()

  // A deck can be tall; render into whatever width the pane actually has.
  useEffect(() => {
    const holder = holderRef.current
    if (!holder) return
    const measure = (): void => setWidth(Math.max(320, holder.clientWidth - 48))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(holder)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    setDoc(null)
    setError(null)
    void window.loomnote
      .noteReadAsset(noteId, relPath)
      .then((bytes) => openPdf(bytes))
      .then((opened) => {
        if (cancelled) {
          void opened.release()
          return
        }
        setDoc(opened)
        onPageCount?.(opened.numPages)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
    // `onPageCount` is intentionally not a dependency: callers pass a fresh
    // closure each render, and re-opening the document on every render would be
    // a document leak.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, relPath])

  useEffect(() => {
    if (page && page !== current) setCurrent(page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!doc || !canvas) return
    let cancelled = false
    void renderPageToCanvas(doc, current, canvas, width).catch((e: unknown) => {
      // A superseded render rejects with a cancellation, which is not a fault.
      const message = e instanceof Error ? e.message : String(e)
      if (!cancelled && !/cancel/i.test(message)) setError(message)
    })
    return () => {
      cancelled = true
    }
  }, [doc, current, width])

  if (error) {
    return (
      <div className="empty-state" style={{ paddingTop: 100 }}>
        <div className="big">📄</div>
        <b>{t('slides.error')}</b>
        <span>{error}</span>
      </div>
    )
  }

  return (
    <div className="slide-view" ref={holderRef}>
      <div className="slide-toolbar">
        <button className="btn" disabled={current <= 1} onClick={() => setCurrent((n) => Math.max(1, n - 1))}>
          ‹
        </button>
        <span className="slide-count">
          {current} / {doc?.numPages ?? '…'}
        </span>
        <button className="btn" disabled={!doc || current >= doc.numPages} onClick={() => setCurrent((n) => n + 1)}>
          ›
        </button>
        <span className="slide-hint">{t('slides.agentCanSee')}</span>
      </div>
      <div className="slide-canvas-wrap">
        <canvas ref={canvasRef} className="slide-canvas" />
      </div>
    </div>
  )
}
