import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../src/renderer/src/render/markdown.js'

describe('renderMarkdown (03 §6 正文模式)', () => {
  it('[[双链]] 渲染为可点链接', () => {
    const { html } = renderMarkdown('参见 [[前缀和]] 与 [[完全背包|变体]]')
    expect(html).toContain('data-wiki="前缀和"')
    expect(html).toContain('href="#/notes/')
    expect(html).toContain('class="wiki"')
    expect(html).toContain('变体')
  })

  it(':::toc 渲染为插槽占位', () => {
    const { html } = renderMarkdown(':::toc\n\n正文')
    expect(html).toContain('data-toc="1"')
    expect(html).toContain('正文')
  })

  it('md+html 混合：:::demo 多行 HTML 块被提取并留插槽', () => {
    const md = ':::demo 排队演示\n<div id="r">step</div>\n<script>1</script>\n:::\n后文'
    const { html, demos } = renderMarkdown(md)
    expect(demos).toHaveLength(1)
    expect(demos[0]).toContain('<div id="r">')
    expect(html).toContain('data-demo-idx="0"')
    expect(html).toContain('data-demo-title="排队演示"')
    expect(html).toContain('后文')
  })

  it('公式与代码不被吞掉', () => {
    const { html } = renderMarkdown('$$f[i][j]$$ 与 ```ts\nconst x = 1\n```')
    expect(html).toContain('f[i][j]')
    expect(html).toContain('hljs')
  })
})