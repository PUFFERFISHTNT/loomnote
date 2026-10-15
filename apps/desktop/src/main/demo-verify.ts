/**
 * Running a generated demo before the note is allowed to keep it.
 *
 * Static discipline checks answer "is this demo allowed to exist" — no external
 * requests, one root, no frame escapes. They cannot answer "does this demo
 * work", and a demo that loads and then throws on its first line is exactly the
 * failure a reader experiences as an empty box. So every `:::demo` the agent
 * writes is executed here, out of sight, in the same locked-down frame the note
 * uses, and measured: did the script run, did it build anything, does it have
 * something to operate.
 *
 * The window is offscreen, sandboxed, and has no preload — it is a test rig, not
 * a browser. It never sees the app's origin, its storage, or its IPC.
 *
 * @module
 */

import { BrowserWindow } from 'electron'
import { validateDemoHtml } from '@loomnote/core'

/** The same CSP the note's sandbox uses. Kept in step with `render/demo.ts`. */
const DEMO_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:;"

/** What the rig managed to observe inside the frame. */
export interface DemoObservation {
  /** Controls the demo exposes (buttons, inputs, summaries). */
  controls: number
  /** Drawn or laid-out content: SVG children, canvas, images, tables. */
  visual: number
  /** Visible text length, as a proxy for "the script filled in its captions". */
  text: number
  /** Errors the frame reported, if any. */
  error: string | null
}

/** The verdict on one demo block. */
export interface DemoVerdict {
  ok: boolean
  /** One line a repair prompt can quote and act on. */
  reason: string
  observation: DemoObservation
}

/** How long a demo gets to finish drawing itself. */
const SETTLE_MS = 2600

/**
 * A single hidden window, reused across demos.
 *
 * Creating one per demo would be simpler but leaks a renderer process per
 * check; a note can carry several demos and a run can produce several notes.
 */
let rig: BrowserWindow | null = null

function getRig(): BrowserWindow {
  if (rig && !rig.isDestroyed()) return rig
  rig = new BrowserWindow({
    show: false,
    width: 640,
    height: 480,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: true,
      // The rig only ever loads a data: URL, but the security posture is the
      // same as the visible sandbox: nothing it renders may reach the app.
      webSecurity: true
    }
  })
  return rig
}

/** Tear the rig down; called when the app quits. */
export function disposeDemoRig(): void {
  if (rig && !rig.isDestroyed()) rig.destroy()
  rig = null
}

/**
 * The measuring script, run inside the frame.
 *
 * It is deliberately written to tolerate a page that threw: every lookup is
 * guarded, so a broken demo produces a measurement of "nothing" rather than an
 * exception that would be indistinguishable from a rig failure.
 */
const MEASURE = `(() => {
  const errs = window.__loomnoteDemoErrors || []
  const svgKids = Array.from(document.querySelectorAll('svg')).reduce((n, s) => n + s.childElementCount, 0)
  const visual = svgKids + document.querySelectorAll('canvas, img, table').length
  const controls = document.querySelectorAll('button,[role=button],input[type=button],input[type=submit],summary').length
  const text = ((document.body && document.body.innerText) || '').trim().length
  return JSON.stringify({ controls, visual, text, error: errs.length ? String(errs[0]).slice(0, 200) : null })
})()`

/**
 * Execute one demo and report what it did.
 * @param html - the demo's markup, exactly as it appears in the note.
 * @returns the verdict a repair prompt can act on.
 */
export async function verifyDemo(html: string): Promise<DemoVerdict> {
  const staticCheck = validateDemoHtml(html)
  if (!staticCheck.ok) {
    const first = staticCheck.issues[0]
    return {
      ok: false,
      reason: `it failed the sandbox discipline check (${first?.rule ?? 'unknown'}: ${first?.message ?? ''})`,
      observation: { controls: 0, visual: 0, text: 0, error: null }
    }
  }

  const win = getRig()
  try {
    await win.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        `<meta http-equiv="Content-Security-Policy" content="${DEMO_CSP}">` +
          `<script>window.__loomnoteDemoErrors=[];window.addEventListener('error',function(e){window.__loomnoteDemoErrors.push((e&&(e.message||e.error))||'script error')});</script>` +
          html
      )}`
    )
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
    const raw = (await win.webContents.executeJavaScript(MEASURE)) as string
    const observation = JSON.parse(raw) as DemoObservation

    if (observation.error) {
      return { ok: false, reason: `it threw at runtime (${observation.error})`, observation }
    }
    if (observation.visual === 0) {
      return { ok: false, reason: 'it ran but drew nothing, so the reader sees an empty box', observation }
    }
    if (observation.controls === 0) {
      return { ok: false, reason: 'it has nothing to operate — no button, input or step control', observation }
    }
    return { ok: true, reason: 'rendered and responded', observation }
  } catch (error) {
    return {
      ok: false,
      reason: `it could not be run (${error instanceof Error ? error.message : String(error)})`,
      observation: { controls: 0, visual: 0, text: 0, error: null }
    }
  }
}

/** One `:::demo` block found in a note. */
export interface DemoBlock {
  /** Title from the `:::demo <title>` line. */
  title: string
  /** The block's markup, without the fences. */
  html: string
  /** 1-based line of the opening fence, for a repair prompt. */
  line: number
}

/**
 * Pull every demo block out of a note.
 *
 * This mirrors the renderer's block rule on purpose but stays independent of
 * it: the point of the check is to catch a note whose blocks would not survive
 * that rule, so sharing the implementation would hide the failure.
 *
 * @param markdown - the note body.
 * @returns the blocks, in document order.
 */
export function extractDemoBlocks(markdown: string): DemoBlock[] {
  const lines = markdown.split('\n')
  const blocks: DemoBlock[] = []
  let open: { title: string; line: number; body: string[] } | null = null
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    if (!open) {
      const match = /^:::demo\b\s*(.*)$/.exec(line)
      if (match) open = { title: (match[1] ?? '').trim(), line: index + 1, body: [] }
      continue
    }
    if (/^\s*:::\s*$/.test(line)) {
      blocks.push({ title: open.title, html: open.body.join('\n'), line: open.line })
      open = null
      continue
    }
    // Bounded the same way the renderer bounds it: an unclosed block ends at
    // the next heading rather than running to the end of the note.
    if (open.body.length > 0 && /^#{1,3} /.test(line)) {
      blocks.push({ title: open.title, html: open.body.join('\n'), line: open.line })
      open = null
      continue
    }
    open.body.push(line)
  }
  return blocks
}
