export interface Embedder {
  readonly dim: number
  embed(text: string): number[]
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!
    na += a[i]! * a[i]!
    nb += b[i]! * b[i]!
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export function normalize(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1
  return v.map((x) => x / n)
}

/**
 * 确定性字符 n-gram 哈希嵌入：无 LLM 联网时也能做「语义相似」召回（MVP 余弦路线，03 §2 向量）。
 * 相同的词汇重叠 → 相似向量；embed 幂等。
 */
export class NGramEmbedder implements Embedder {
  constructor(public readonly dim = 128) {}
  embed(text: string): number[] {
    const v = new Array<number>(this.dim).fill(0)
    const t = String(text).toLowerCase()
    const grams = new Set<string>()
    for (const w of t.match(/[a-z0-9\u4e00-\u9fff]+/g) ?? []) {
      for (let n = 1; n <= 3 && n <= w.length; n++) {
        for (let i = 0; i + n <= w.length; i++) grams.add(w.slice(i, i + n))
      }
    }
    for (const g of grams) {
      const h = fnv(g) % this.dim
      v[h]! += 1
    }
    return normalize(v)
  }
}

/** 测试用：把输入映射成确定、可预测的向量（相同文本相同向量）。 */
export class FakeEmbedder implements Embedder {
  constructor(public readonly dim = 8) {}
  embed(text: string): number[] {
    const v = new Array<number>(this.dim).fill(0)
    for (const ch of text) {
      v[ch.charCodeAt(0) % this.dim]! += 1
    }
    return normalize(v)
  }
}

function fnv(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}