import { useEffect, useRef, useState } from 'react'
import { buildDemoDataUrl, checkDemo } from '../render/demo.js'
import { t, useLang } from '../i18n.js'

/** 演示沙箱组件：sandbox iframe 三件套（srcdoc + meta CSP + MessageChannel 桥）+ 纪律校验前置。 */
export function DemoSandbox({ html, title, compact }: { html: string; title?: string; compact?: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const portRef = useRef<MessagePort | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [valid, setValid] = useState(() => checkDemo(html))
  // 演示内容高度由帧内脚本回报（固定高度会在内容较短时留一大片空白）
  const [frameH, setFrameH] = useState(compact ? 420 : 540)
  useLang()

  useEffect(() => {
    setValid(checkDemo(html))
  }, [html])

  useEffect(() => {
    const iframe = ref.current
    if (!iframe || !valid.ok) return
    // 帧内主动上报内容高度（在父页窗口上监听，并校验来源就是本 iframe）
    const onWindowMessage = (ev: MessageEvent) => {
      const data = ev.data as { __loomnote?: string; height?: number }
      if (data?.__loomnote !== 'resize' || ev.source !== iframe.contentWindow) return
      if (typeof data.height !== 'number') return
      setFrameH(Math.max(120, Math.min(Math.round(data.height) + 2, 1400)))
    }
    window.addEventListener('message', onWindowMessage)
    return () => window.removeEventListener('message', onWindowMessage)
  }, [valid.ok, html])

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
        <h4>🛡 {t('demo.blocked')}</h4>
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
        <b>{title ?? t('demo.interactive')}</b>
        <span className="chip ok">✓ {t('demo.sandboxed')}</span>
        <span className="chip gray">{t('demo.external')} = 0</span>
      </div>
      <iframe
        ref={ref}
        className={compact ? 'demo-frame compact' : 'demo-frame'}
        style={{ height: frameH }}
        sandbox="allow-scripts allow-forms"
        src={buildDemoDataUrl(html)}
      />
      {log.length > 0 && (
        <div style={{ borderTop: '1px solid var(--line)', padding: '6px 16px', fontSize: 11.5, color: 'var(--text3)' }}>
          {t('demo.bridge')}{log.join(' · ')}
        </div>
      )}
    </div>
  )
}
