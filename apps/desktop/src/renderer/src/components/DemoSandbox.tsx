import { useEffect, useRef, useState } from 'react'
import { buildDemoDataUrl, checkDemo } from '../render/demo.js'

/** 演示沙箱组件：sandbox iframe 三件套（srcdoc + meta CSP + MessageChannel 桥）+ 纪律校验前置。 */
export function DemoSandbox({ html, title, compact }: { html: string; title?: string; compact?: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const portRef = useRef<MessagePort | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [valid, setValid] = useState(() => checkDemo(html))

  useEffect(() => {
    setValid(checkDemo(html))
  }, [html])

  useEffect(() => {
    const iframe = ref.current
    if (!iframe || !valid.ok) return
    const channel = new MessageChannel()
    portRef.current?.close()
    portRef.current = channel.port1
    channel.port1.onmessage = (e) => {
      const data = e.data as { type?: string; message?: string }
      if (data?.type) setLog((l) => [...l.slice(-3), `${data.type}${data.message ? ': ' + data.message : ''}`])
    }
    const onLoad = () => {
      iframe.contentWindow?.postMessage({ __loomnote_bridge: true }, '*', [channel.port2])
    }
    iframe.addEventListener('load', onLoad)
    if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') onLoad()
    return () => {
      iframe.removeEventListener('load', onLoad)
      channel.port1.close()
    }
  }, [html, valid.ok])

  if (!valid.ok) {
    return (
      <div className="demo-invalid">
        <h4>🛡 演示片段未通过纪律校验，已拦截（不会渲染）</h4>
        <ul>
          {valid.issues.map((i) => (
            <li key={i.rule}>
              <b>{i.rule}</b> — {i.message}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="demo-card">
      <div className="demo-card-bar">
        <b>{title ?? 'AI 交互演示'}</b>
        <span className="chip ok">✓ 沙箱渲染</span>
        <span className="chip gray">外联 = 0</span>
      </div>
      <iframe ref={ref} className={compact ? "demo-frame compact" : "demo-frame"} sandbox="allow-scripts allow-forms" src={buildDemoDataUrl(html)} />
      {log.length > 0 && (
        <div style={{ borderTop: '1px solid var(--line)', padding: '6px 16px', fontSize: 11.5, color: 'var(--text3)' }}>
          桥接事件：{log.join(' · ')}
        </div>
      )}
    </div>
  )
}