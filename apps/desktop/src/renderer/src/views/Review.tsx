import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { scheduleReview, type ReviewCard, type ReviewRating } from '@loomnote/core'
import { useApp } from '../stores/app.js'
import { locale, useLang } from '../i18n.js'
import { StudyMarkdown } from '../components/StudyMarkdown.js'

export function Review() {
  const zh = useLang() === 'zh'
  const notes = useApp((s) => s.notes)
  const [cards, setCards] = useState<ReviewCard[]>([])
  const [loaded, setLoaded] = useState(false)
  const [revealed, setRevealed] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(Date.now())
  const navigate = useNavigate()
  useEffect(() => {
    let cancelled = false
    void window.loomnote.reviewList().then((result) => { if (!cancelled) { setCards(result); setLoaded(true) } })
      .catch((e: unknown) => useApp.getState().setError(String(e)))
    return () => { cancelled = true }
  }, [notes])
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer) }, [])
  const filtered = cards.filter((c) => !filter || c.noteId === filter)
  const due = filtered.filter((c) => c.progress.dueAt <= now)
  const card = due[0]
  const next = filtered.find((c) => c.progress.dueAt > now)

  async function rate(rating: ReviewRating) {
    if (!card || busy) return
    setBusy(true)
    try {
      await window.loomnote.reviewRate(card.id, rating)
      setCards(await window.loomnote.reviewList())
      setNow(Date.now())
      setRevealed(null)
    } catch (e) { useApp.getState().setError(String(e)) } finally { setBusy(false) }
  }
  return <div className="view study-view">
    <h1 className="view-title">{zh ? '复习中心' : 'Review'}</h1>
    <p className="view-sub">{zh ? '先回忆，再查看答案并自评。错题十分钟后重现，记录保存在本机。' : 'Recall first, reveal the answer, then rate yourself. Missed questions return in ten minutes; history stays on this machine.'}</p>
    <div className="study-actions">
      <label>{zh ? '笔记' : 'Note'} <select value={filter} onChange={(e) => { setFilter(e.target.value); setRevealed(null) }}>
        <option value="">{zh ? '全部笔记' : 'All notes'}</option>
        {notes.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
      </select></label>
      <span className="chip blue">{due.length} {zh ? '题待复习' : 'due'}</span>
      <span className="hint">{filtered.length} {zh ? '题，共' : 'cards ·'} {filtered.reduce((n, c) => n + c.progress.repetitions, 0)} {zh ? '次复习' : 'reviews'}</span>
    </div>
    {!loaded ? <p>{zh ? '加载中…' : 'Loading…'}</p> : card ? <article className="study-card">
      <div className="study-actions"><span className="chip gray">{card.noteTitle}</span><span className="hint">{card.progress.lapses} {zh ? '次遗忘' : 'lapses'}</span></div>
      <StudyMarkdown text={card.question} />
      {revealed !== card.id ? <button className="btn primary" onClick={() => setRevealed(card.id)}>{zh ? '查看答案' : 'Reveal answer'}</button> : <>
        <div className="study-answer"><StudyMarkdown text={card.answer || (zh ? '笔记尚未提供答案，请返回笔记补充。' : 'This note has no answer yet. Add one in the note before rating.')} /></div>
        <button className="btn" onClick={() => navigate(`/notes/${encodeURIComponent(card.noteId)}${card.page ? `?page=${card.page}` : ''}`)}>{card.page ? (zh ? `返回原文第 ${card.page} 页` : `Check source, p. ${card.page}`) : (zh ? '打开笔记核对' : 'Check the note')}</button>
        <div className="study-actions" style={{ marginTop: 20 }}>
          {(['again', 'hard', 'good', 'easy'] as const).map((rating, i) => <button key={rating} className={rating === 'again' ? 'btn' : 'btn primary'} disabled={busy || !card.answer} onClick={() => void rate(rating)}>
            {(zh ? ['忘了', '困难', '记得', '简单'] : ['Again', 'Hard', 'Good', 'Easy'])[i]}
            <small>{new Date(scheduleReview(card.progress, rating, now).dueAt).toLocaleString(locale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small>
          </button>)}
        </div>
      </>}
    </article> : <div className="empty-state"><div className="big">✓</div><b>{filtered.length ? (zh ? '本轮复习完成' : 'All caught up') : (zh ? '还没有自测题' : 'No self-test questions yet')}</b><span>{next ? `${zh ? '下次复习：' : 'Next review: '}${new Date(next.progress.dueAt).toLocaleString(locale())}` : (zh ? '让 AI 在笔记中添加 Self-test / 自测章节，每题紧跟答案。' : 'Ask the agent to add a Self-test section with each question followed by its own answer.')}</span></div>}
  </div>
}
