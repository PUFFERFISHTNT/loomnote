/**
 * The agent panel: a conversation with the note's own agent.
 *
 * It shows what the agent is doing while it does it — reasoning replayed at the
 * model's original pace, every tool call, the note growing on the left — because
 * the point of the product is that the work is visible, interruptible and
 * steerable rather than something that appears at the end.
 *
 * @module
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { HarnessOption, HarnessStatus } from '@loomnote/harness'
import { useApp } from '../stores/app.js'
import { useChat, type ChatItem } from '../stores/chat.js'
import { locale, t, useLang } from '../i18n.js'

/** How the student wants the next message treated. */
type Mode = 'auto' | 'edit' | 'explain'

/** Status chip appearance. */
function statusTone(status: HarnessStatus): string {
  if (status === 'running' || status === 'starting') return 'blue'
  if (status === 'error') return 'err'
  if (status === 'idle' || status === 'ready') return 'ok'
  return 'gray'
}

export function ChatPanel() {
  const open = useApp((s) => s.chatOpen)
  const activeNote = useApp((s) => s.activeNote)
  const items = useChat((s) => s.items)
  const liveThinking = useChat((s) => s.liveThinking)
  const liveAnswer = useChat((s) => s.liveAnswer)
  const status = useChat((s) => s.status)
  const running = useChat((s) => s.running)
  const switchNote = useChat((s) => s.switchNote)
  const ask = useChat((s) => s.ask)
  const [text, setText] = useState('')
  const [mode, setMode] = useState<Mode>('auto')
  const [error, setError] = useState<string | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  useLang()

  // Grow with the request, up to a third of the panel: the composer must never
  // become the place a long instruction disappears.
  useEffect(() => {
    const composer = composerRef.current
    if (!composer) return
    composer.style.height = 'auto'
    composer.style.height = `${Math.min(composer.scrollHeight, 150)}px`
  }, [text])

  const noteId = activeNote?.id ?? null
  useEffect(() => {
    switchNote(noteId)
  }, [noteId, switchNote])

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight })
  }, [items.length, liveThinking, liveAnswer])

  const hasContent = items.length > 0 || liveThinking.length > 0 || liveAnswer.length > 0

  async function send(): Promise<void> {
    const value = text.trim()
    if (!value || !noteId) return
    const prefixed = mode === 'auto' ? value : `${mode === 'edit' ? t('chat.mode.editPrefix') : t('chat.mode.explainPrefix')} ${value}`
    setText('')
    setError(null)
    ask(value)
    try {
      await window.loomnote.chatSend(noteId, prefixed)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function sendOption(item: ChatItem, option: HarnessOption): Promise<void> {
    if (!noteId || item.kind !== 'ask') return
    useChat.getState().answerAsk(item.id, option.label)
    setError(null)
    ask(option.label)
    try {
      await window.loomnote.chatSend(noteId, option.label)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (!open) return null

  return (
    <aside className="agent-dock">
      <div className="agent-head">
        <b>
          <span className={running ? 'dot on' : 'dot'} />
          {t('chat.title')}
        </b>
        {running && (
          <button
            className="btn danger"
            style={{ padding: '3px 10px', fontSize: 12 }}
            onClick={() => {
              if (noteId) void window.loomnote.chatStop(noteId)
            }}
          >
            ■ {t('chat.stop')}
          </button>
        )}
        <button className="icon-btn" onClick={() => useApp.getState().setChatOpen(false)} title={t('chat.collapse')}>
          ✕
        </button>
      </div>

      <div className="agent-stats">
        <span className={`chip ${statusTone(status)}`}>{t(`chat.status.${status}` as 'chat.status.idle')}</span>
        {activeNote && <span className="chip gray">{activeNote.title.slice(0, 26)}</span>}
      </div>

      <div className="agent-body" ref={bodyRef}>
        {!noteId && (
          <div className="empty-state" style={{ padding: '48px 12px' }}>
            <div className="big">✳</div>
            <b>{t('chat.noNote.title')}</b>
            <span>{t('chat.noNote.body')}</span>
          </div>
        )}

        {noteId && !hasContent && (
          <div className="empty-state" style={{ padding: '40px 12px' }}>
            <div className="big">✳</div>
            <b>{t('chat.empty.title')}</b>
            <span>{t('chat.empty.body')}</span>
          </div>
        )}

        {items.map((item) => (
          <Item key={item.id} item={item} onChoose={(option) => void sendOption(item, option)} disabled={running} />
        ))}

        {(liveThinking.length > 0 || liveAnswer.length > 0) && (
          <div className="chat-live">
            <div className="chat-live-head">
              <span className="spinner" />
              {t('chat.working')}
            </div>
            {liveThinking.length > 0 && (
              <div className="thinking-block">
                <div className="thinking-head">{t('chat.thinking')}</div>
                <div className="thinking-body">
                  {liveThinking}
                  <span className="stream-cursor" />
                </div>
              </div>
            )}
            {liveAnswer.length > 0 && <div className="chat-live-answer">{liveAnswer}</div>}
          </div>
        )}
      </div>

      {error && (
        <div className="chat-error" role="alert">
          {error}
        </div>
      )}

      <div className="chat-compose">
        <div className="chat-modes">
          {(['auto', 'edit', 'explain'] as const).map((value) => (
            <button key={value} className={mode === value ? 'active' : ''} onClick={() => setMode(value)} title={t(`chat.mode.${value}.hint` as 'chat.mode.auto.hint')}>
              {t(`chat.mode.${value}` as 'chat.mode.auto')}
            </button>
          ))}
        </div>
        <div className="req-input">
          {/*
            A textarea rather than an input: a real request is a sentence or
            three ("keep the formulas short and animate the queueing problem"),
            and a single line hides most of it while it is being written.
          */}
          <textarea
            ref={composerRef}
            rows={1}
            value={text}
            placeholder={t('chat.placeholder')}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            disabled={!noteId}
          />
          <button className="btn primary" style={{ padding: '6px 12px', alignSelf: 'flex-end' }} disabled={!noteId || !text.trim()} onClick={() => void send()}>
            {t('chat.send')}
          </button>
        </div>
      </div>
    </aside>
  )
}

function Item({ item, onChoose, disabled }: { item: ChatItem; onChoose: (option: HarnessOption) => void; disabled: boolean }) {
  useLang()
  const time = useMemo(() => new Date(item.at).toLocaleTimeString(locale(), { hour12: false }), [item.at])

  switch (item.kind) {
    case 'user':
      return (
        <div className="chat-user">
          <div className="chat-user-text">{item.text}</div>
          <span className="chat-time">{time}</span>
        </div>
      )

    case 'answer':
      return (
        <div className="chat-answer">
          {item.thinking.length > 0 && <Thinking text={item.thinking} />}
          <div className="chat-answer-text">{item.text}</div>
          <span className="chat-time">{time}</span>
        </div>
      )

    case 'tool':
      return (
        <details className={`chat-tool ${item.ok === false ? 'fail' : item.ok ? 'ok' : ''}`}>
          <summary>
            <code>{item.name || t('chat.tool')}</code>
            <span className="chat-tool-state">{item.ok === null ? t('chat.tool.running') : item.ok ? t('chat.tool.ok') : t('chat.tool.fail')}</span>
            <span className="chat-time">{time}</span>
          </summary>
          <div className="json">{item.args}</div>
          {item.output && <div className="json chat-tool-out">{item.output.slice(0, 4000)}</div>}
        </details>
      )

    case 'ask':
      return (
        <div className="chat-ask">
          <div className="chat-ask-head">{t('chat.ask.title')}</div>
          <div className="chat-ask-question">{item.question}</div>
          {item.answered ? (
            <div className="chat-ask-answered">
              ✓ {t('chat.ask.answered')} <b>{item.answered}</b>
            </div>
          ) : (
            <div className="chat-ask-options">
              {item.options.map((option) => (
                <button key={option.label} className="chat-ask-option" disabled={disabled} onClick={() => onChoose(option)}>
                  <b>{option.label}</b>
                  {option.detail && <span>{option.detail}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )

    case 'error':
      return (
        <div className="evt-card error">
          <div className="evt-head">
            ⛔ {t('chat.error')} <span className="time">{time}</span>
          </div>
          <div className="evt-body">{item.text}</div>
        </div>
      )

    default:
      return null
  }
}

/** The reasoning behind one step, collapsed by default so the answer stays in front. */
function Thinking({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  useLang()
  return (
    <div className="thinking-block settled">
      <button className="thinking-head" onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} {t('chat.thinking')} <span className="thinking-meta">{t('chat.thinking.chars', { n: text.length })}</span>
      </button>
      {open && <div className="thinking-body">{text}</div>}
    </div>
  )
}
