import { estimateTokens } from '@loomnote/core'

export interface ChunkOptions {
  maxTokens?: number
  overlapRatio?: number
}

const SENTENCE_SPLIT_RE = /(?<=[。！？!?；;.\n])/
const HARD_BREAK_RE = /(?<=[，,:：、\s])/

/** 句级切分：85% token 预算 + 重叠，超长句按标点强制断（04 §1 写入层纪律的 TS 版）。 */
export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const t = (text ?? '').trim()
  if (!t) return []
  const maxTokens = opts.maxTokens ?? Math.floor(8000 * 0.85)
  const overlapTokens = Math.floor(maxTokens * (opts.overlapRatio ?? 0.1))

  const sentences: string[] = []
  for (const seg of t.split(SENTENCE_SPLIT_RE)) {
    const s = seg.trim()
    if (!s) continue
    if (estimateTokens(s) > maxTokens) sentences.push(...forceSplitLong(s, maxTokens))
    else sentences.push(s)
  }

  const chunks: string[] = []
  let current = ''
  let currentTokens = 0
  for (const sentence of sentences) {
    const tok = estimateTokens(sentence)
    if (current && currentTokens + tok > maxTokens) {
      chunks.push(current.trim())
      // 回溯构建重叠尾部
      let overlap = ''
      let overlapTok = 0
      for (let j = chunks.length; j >= 0; j--) {
        const prev = sentences[j]
        if (prev == null) continue
        const pt = estimateTokens(prev)
        if (overlapTok + pt > overlapTokens) break
        overlap = prev + overlap
        overlapTok += pt
      }
      current = overlap
      currentTokens = overlapTok
    }
    current += sentence
    currentTokens += tok
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

function forceSplitLong(sentence: string, maxTokens: number): string[] {
  const out: string[] = []
  let buf = ''
  for (const seg of sentence.split(HARD_BREAK_RE)) {
    if (estimateTokens(buf + seg) > maxTokens && buf) {
      out.push(buf.trim())
      buf = seg
    } else {
      buf += seg
    }
    if (estimateTokens(buf) > maxTokens) {
      // 极端长片段按字符硬切
      while (estimateTokens(buf) > maxTokens) {
        out.push(buf.slice(0, Math.floor(maxTokens * 2.2)).trim())
        buf = buf.slice(Math.floor(maxTokens * 2.2))
      }
    }
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}