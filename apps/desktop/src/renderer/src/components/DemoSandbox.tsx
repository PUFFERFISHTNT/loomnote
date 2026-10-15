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
  /** An error thrown inside the frame, shown instead of a silent blank box. */
  const [fault, setFault] = useState<string | null>(null)
  /** The frame's own report on what it managed to build. */
  const [health, setHealth] = useState<string | null>(null)
  useLang()

  useEffect(() => {
    setValid(checkDemo(html))
    setFault(null)
    setHealth(null)
  }, [html])

  // A demo is a program, and static checks cannot tell a working one from a
  // page that throws on its first line — so the frame reports what it built and
  // **an explicit report** decides. Silence is deliberately not a failure: the
  // port handshake can lose a race, and a working demo marked broken is a worse
  // outcome than a broken demo shown once.

  useEffect(() => {
    const iframe = ref.current
    if (!iframe || !valid.ok) return

    // Handing a port to a sandboxed frame is a race: the frame is cross-origin,
    // so `contentDocument` is null, and its `load` event can fire before this
    // effect runs. A frame that never receives the port cannot report what it
    // built — and a silent frame used to be read as a broken demo. So the
    // handover is retried with a fresh channel until the frame answers.
    let acked = false
    let channel: MessageChannel | null = null
    const timers: NodeJS.Timeout[] = []

    const attempt = (): void => {
      if (acked || !iframe.contentWindow) return
      channel?.port1.close()
      channel = new MessageChannel()
      channel.port1.onmessage = (event) => {
        const data = event.data as { type?: string; message?: string } | null
        if (!data?.type) return
        if (data.type === 'bridge-ready') {
          acked = true
          clearInterval(interval)
          return
        }
        // A demo that dies inside its own frame used to leave an empty box with
        // no explanation. The frame reports its errors through this channel.
        if (data.type === 'demo-error') {
          setFault(data.message ?? 'unknown error')
          return
        }
        if (data.type === 'demo-health') {
          setHealth(data.message ?? '')
          if (/visual=0\b/.test(data.message ?? '')) setFault(t('demo.error.empty'))
          else setFault(null)
          return
        }
        setLog((l) => [...l.slice(-3), `${data.type}${data.message ? ': ' + data.message : ''}`])
      }
      try {
        iframe.contentWindow.postMessage({ __loomnote_bridge: true }, '*', [channel.port2])
      } catch {
        /* the frame may still be navigating; the next attempt will try again */
      }
    }

    iframe.addEventListener('load', attempt)
    const interval = setInterval(attempt, 400)
    timers.push(setTimeout(() => clearInterval(interval), 10000))
    attempt()

    return () => {
      acked = true
      clearInterval(interval)
      for (const timer of timers) clearTimeout(timer)
      iframe.removeEventListener('load', attempt)
      channel?.port1.close()
    }
  }, [html, valid.ok])

  if (fault) {
    return (
      <div className="demo-invalid">
        <h4>⚠ {t('demo.error')}</h4>
        <p style={{ margin: '4px 0 0', fontSize: 13 }}>{fault}</p>
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text2)' }}>{t('demo.error.hint')}</p>
      </div>
    )
  }

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
      {(log.length > 0 || health) && (
        <div style={{ borderTop: '1px solid var(--line)', padding: '6px 16px', fontSize: 11.5, color: 'var(--text3)' }}>
          {t('demo.bridge')}
          {log.join(' · ')}
          {health && <span style={{ marginLeft: log.length ? 8 : 0 }}>{health}</span>}
        </div>
      )}
    </div>
  )
}
