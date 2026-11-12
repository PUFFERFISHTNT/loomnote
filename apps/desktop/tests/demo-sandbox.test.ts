/**
 * The sandbox is the one part of a note that can fail without saying so.
 *
 * A demo is a program the model wrote: it can be dropped on the way into the
 * note, rejected by the checker, or run and draw nothing. Each of those turns
 * into an empty box the reader cannot act on, so each gets a test here — plus
 * the contract the frame's bootstrap has to honour, because the app's runtime
 * health check depends on it.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { validateDemoHtml } from '@loomnote/core'
import { renderMarkdown } from '../src/renderer/src/render/markdown.js'
import { buildDemoSrcdoc, buildDemoDataUrl, DEMO_CSP } from '../src/renderer/src/render/demo.js'

/** A minimal demo that does something: one control, one drawing. */
const WORKING_DEMO = [
  '<div id="d">',
  '<button id="b">Next</button>',
  '<svg id="s" viewBox="0 0 100 40"><circle cx="10" cy="10" r="5"/></svg>',
  '</div>',
  '<script>document.getElementById("b").onclick=function(){document.getElementById("s").setAttribute("data-step","1")}</script>'
].join('\n')

describe('getting a demo out of a note', () => {
  it('extracts a demo and leaves a slot for it', () => {
    const { html, demos } = renderMarkdown(`Before\n\n:::demo A title\n${WORKING_DEMO}\n:::\n\nAfter`)
    expect(demos).toHaveLength(1)
    expect(demos[0]).toContain('<button id="b">')
    expect(demos[0]).toContain('</script>')
    expect(html).toContain('data-demo-idx="0"')
    expect(html).toContain('After')
  })

  it('extracts a demo that follows an unclosed :::toc', () => {
    // The regression that blanked a demo in the recorded run: the model wrote
    // an unclosed `:::toc`, listed the sections, then wrote the demo. A greedy
    // "closed toc" scan took the demo's own `:::` as the toc's terminator and
    // swallowed the entire demo, leaving the note with no demo at all.
    const note = ['# Title', ':::toc', '## One', '## Two', ':::demo Rotation', WORKING_DEMO, ':::', '## One', 'Body.'].join('\n')
    const { html, demos } = renderMarkdown(note)
    expect(demos, 'the demo survived the toc scan').toHaveLength(1)
    expect(html).toContain('data-demo-idx="0"')
    expect(html).toContain('<h2>One</h2>')
  })

  it('extracts several demos, in order, with stable indices', () => {
    const note = [':::demo First', WORKING_DEMO, ':::', 'text', ':::demo Second', WORKING_DEMO, ':::'].join('\n')
    const { html, demos } = renderMarkdown(note)
    expect(demos).toHaveLength(2)
    expect(html).toContain('data-demo-idx="0"')
    expect(html).toContain('data-demo-idx="1"')
    expect(html).toContain('data-demo-title="First"')
    expect(html).toContain('data-demo-title="Second"')
  })

  it('keeps a closed :::toc from rendering its own contents twice', () => {
    const { html } = renderMarkdown(':::toc\n## One\n## Two\n:::\n\n## One\n\nBody.')
    expect(html.match(/data-toc="1"/g)).toHaveLength(1)
    expect(html.match(/One/g)).toHaveLength(1)
  })
})

describe('the sandbox discipline check', () => {
  it('accepts a self-contained demo', () => {
    expect(validateDemoHtml(WORKING_DEMO).ok).toBe(true)
  })

  it('refuses a demo that reaches out to the network', () => {
    for (const bad of ['<img src="https://example.com/x.png">', '<script src="https://cdn.example.com/a.js"></script>', '<link rel="stylesheet" href="http://example.com/a.css">']) {
      expect(validateDemoHtml(bad).ok, bad).toBe(false)
    }
  })

  it('refuses a demo that escapes its frame', () => {
    for (const bad of ['<script>window.top.location="https://example.com"</script>', '<iframe src="https://example.com"></iframe>', '<script>parent.document.body.innerHTML="x"</script>']) {
      expect(validateDemoHtml(bad).ok, bad).toBe(false)
    }
  })
})

describe('the frame bootstrap contract', () => {
  const srcdoc = buildDemoSrcdoc(WORKING_DEMO)

  it('locks the frame down before the demo runs', () => {
    expect(srcdoc.startsWith('<meta http-equiv="Content-Security-Policy"')).toBe(true)
    expect(srcdoc).toContain(DEMO_CSP)
    expect(DEMO_CSP).toContain("default-src 'none'")
    expect(DEMO_CSP).toContain("script-src 'unsafe-inline'")
  })

  it('answers the commands the app checks a demo with', () => {
    // probe → what the demo can be operated with; click → operate it; health →
    // what it actually built; hello → the frame announcing itself so the port
    // handshake cannot be lost to a race.
    for (const command of ["'probe'", "'click'", 'demo-health', 'demo-error', "'hello'"]) {
      expect(srcdoc, `bootstrap handles ${command}`).toContain(command)
    }
  })

  it('reports frame errors instead of dying silently', () => {
    expect(srcdoc).toContain("addEventListener('error'")
    expect(srcdoc).toContain("addEventListener('unhandledrejection'")
  })

  it('builds a data URL that cannot inherit the app page CSP', () => {
    const url = buildDemoDataUrl(WORKING_DEMO)
    expect(url.startsWith('data:text/html;charset=utf-8,')).toBe(true)
    expect(decodeURIComponent(url)).toContain('<button id="b">')
  })

  it('declares no variable twice', () => {
    // `var` hoisting means a second declaration silently replaces the first: a
    // duplicated `queue` turned the resize reporter into an array, and a call
    // placed above its own `var` threw. Both errors surfaced inside the frame,
    // where the frame's own error listener reported them and a working demo was
    // marked broken.
    const script = /<script>([\s\S]*?)<\/script>/.exec(srcdoc)?.[1] ?? ''
    // Only the bootstrap's own scope matters: two `var`s of the same name there
    // overwrite each other. A same-named `var` inside a nested function is a
    // separate binding and is left alone.
    const declared = topLevelVars(script)
    const duplicates = [...new Set(declared.filter((name, i) => declared.indexOf(name) !== i))]
    expect(duplicates, `duplicate top-level var declarations: ${duplicates.join(', ')}`).toEqual([])
    expect(declared.length, 'the scan found the bootstrap\'s own scope').toBeGreaterThan(5)
  })

  it('defines every function before it calls it', () => {
    // `var` hoists the name but not the value, so a call written above its own
    // definition runs `undefined()` — which is exactly how the bridge broke a
    // working demo twice.
    const script = /<script>([\s\S]*?)<\/script>/.exec(srcdoc)?.[1] ?? ''
    for (const call of script.matchAll(/(?:^|[;{}])([A-Za-z_$][\w$]*)\(\)/g)) {
      const name = call[1] as string
      const definition = new RegExp(`\\bvar\\s+${name}\\s*=`).exec(script)
      if (!definition) continue
      expect(
        definition.index,
        `${name}() is called at ${call.index} before it is defined at ${definition.index}`
      ).toBeLessThan(call.index as number)
    }
  })

  it('is valid JavaScript', () => {
    // The bootstrap is injected into every demo; a syntax error there would
    // break every demo in every note at once.
    // The bootstrap is the first script in the document; the demo's own script
    // follows it and is not part of the contract under test.
    const script = /<script>([\s\S]*?)<\/script>/.exec(srcdoc)?.[1] ?? ''
    expect(script.length).toBeGreaterThan(100)
    expect(() => new Function(script)).not.toThrow()
  })
})

describe('the demo a real run produced', () => {
  const notePath = process.env['LOOMNOTE_SAMPLE_NOTE']
  const note = notePath ? safeRead(notePath) : null

  it.skipIf(!note)('keeps every demo block the model wrote', () => {
    const source = note as string
    const declared = (source.match(/^:::demo\b/gm) ?? []).length
    const { demos } = renderMarkdown(source)
    expect(demos).toHaveLength(declared)
  })

  it.skipIf(!note)('passes the discipline check', () => {
    const { demos } = renderMarkdown(note as string)
    for (const demo of demos) expect(validateDemoHtml(demo).ok).toBe(true)
  })
})

function safeRead(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

describe('a demo block is bounded', () => {
  it('does not swallow the rest of the note when the closing fence is missing', () => {
    // A model that forgets `:::` must not turn the whole note into one demo:
    // the reader would see the demo fail and everything after it as raw text.
    const note = [':::demo Unclosed', WORKING_DEMO, '## Next section', 'Real body text.'].join('\n')
    const { html, demos } = renderMarkdown(note)
    expect(demos).toHaveLength(1)
    expect(demos[0]).not.toContain('Real body text.')
    expect(html).toContain('<h2>Next section</h2>')
    expect(html).toContain('Real body text.')
  })

  it('bounds the block the same way in the main-process extractor', async () => {
    const { extractDemoBlocks } = await import('../src/main/demo-verify.js')
    const note = [':::demo Unclosed', WORKING_DEMO, '## Next section', 'Real body text.'].join('\n')
    const blocks = extractDemoBlocks(note)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.html).not.toContain('Real body text.')
  })
})

describe('the contents list cannot navigate the router away', () => {
  it('never writes a bare hash href, which a HashRouter would read as a route', () => {
    const source = readFileSync(new URL('../src/renderer/src/render/markdown.ts', import.meta.url), 'utf8')
    expect(source, 'the toc anchor must not set a bare #id href').not.toMatch(/a\.href = `#\$\{h\.id\}`/)
    expect(source).toContain("a.dataset['target'] = h.id")
    expect(source).toContain('scrollIntoView')
  })
})

describe('a chat reply is rendered, not printed', () => {
  it('turns the agent\'s Markdown into elements', () => {
    // The panel used to print the source, so `**bold**` and `- item` reached
    // the reader as punctuation.
    const reply = ['**Done.** I changed 3 lines:', '', '- `bf(50)` is now +2', '- the rotation moved below 40', '', 'See `note.md` line 42.'].join('\n')
    const { html } = renderMarkdown(reply)
    expect(html).toContain('<strong>Done.</strong>')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
    expect(html).toContain('<code>bf(50)</code>')
    expect(html, 'no raw asterisks survive').not.toContain('**Done.**')
  })
})

/**
 * The `var` names the bootstrap declares in its own scope.
 *
 * The bridge is one line, so this walks characters rather than lines. The body
 * of `(()=>{ ... })()` sits at depth 2 — one for the wrapping call, one for the
 * arrow body — and a `var` repeated there silently replaces the first.
 *
 * @param script - the bootstrap's source, without its `<script>` tags.
 * @returns the names, in order of appearance.
 */
function topLevelVars(script: string): string[] {
  const found: string[] = []
  let depth = 0
  for (let i = 0; i < script.length; i += 1) {
    const ch = script[i]
    if (ch === '{' || ch === '(') depth += 1
    else if (ch === '}' || ch === ')') depth -= 1
    else if (depth === 2 && ch === 'v' && script.startsWith('var ', i)) {
      const name = /^var\s+([A-Za-z_$][\w$]*)/.exec(script.slice(i))?.[1]
      if (name) found.push(name)
    }
  }
  return found
}
