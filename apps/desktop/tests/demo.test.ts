import { describe, it, expect } from 'vitest'
import { buildDemoSrcdoc, checkDemo, DEMO_CSP } from '../src/renderer/src/render/demo.js'

describe('demo sandbox srcdoc (07 §2)', () => {
  it('注入不可变 meta CSP + 桥接引导', () => {
    const doc = buildDemoSrcdoc('<div id="r">hi</div>')
    expect(doc).toContain('http-equiv="Content-Security-Policy"')
    expect(doc).toContain(DEMO_CSP)
    expect(doc).toContain('__loomnotePort')
  })

  it('外联资源=0 预检拒绝恶意片段', () => {
    const bad = checkDemo(`<div id="r"><img src="https://evil.example/x.png"></div>`)
    expect(bad.ok).toBe(false)
    expect(bad.issues.some((i) => i.rule === 'external-resource')).toBe(true)
    expect(checkDemo('<div id="r">ok</div>').ok).toBe(true)
  })
})