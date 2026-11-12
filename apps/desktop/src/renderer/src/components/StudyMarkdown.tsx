import { useEffect, useRef } from 'react'
import DOMPurify from 'dompurify'
import { hydrateMarkdown, renderMarkdown } from '../render/markdown.js'

/** Study cards render text and formulas; executable demos belong in the note sandbox. */
export function StudyMarkdown({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    ref.current.innerHTML = DOMPurify.sanitize(renderMarkdown(text).html)
    void hydrateMarkdown(ref.current).catch(() => undefined)
  }, [text])
  return <div className="md study-markdown" ref={ref} />
}
