import { cosine } from './embedder.js'

/** 内容哈希（幂等去重键）。 */
export function contentHash(text: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')
}

export interface Candidate<T> {
  item: T
  hash: string
  vector?: number[]
}

/** hard（哈希精确）+ semantic（余弦阈值）双轨去重（04 §5 min_score 0.40，语义去重阈值 0.92）。 */
export function dedupe<T>(candidates: Candidate<T>[], semanticThreshold = 0.92): T[] {
  const seenHash = new Set<string>()
  const kept: Candidate<T>[] = []
  for (const c of candidates) {
    if (seenHash.has(c.hash)) continue
    if (c.vector && kept.some((k) => k.vector && cosine(k.vector!, c.vector!) > semanticThreshold)) continue
    seenHash.add(c.hash)
    kept.push(c)
  }
  return kept.map((k) => k.item)
}