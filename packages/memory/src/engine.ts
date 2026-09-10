import { contentHash } from './dedup.js'
import { chunkText } from './chunker.js'
import type { Embedder } from './embedder.js'
import { recall } from './recall.js'
import { buildMemoryPackage, type MemoryPackage } from './packager.js'
import { distillRules, RuleBook } from './rules.js'
import type {
  AuditSnapshot,
  BehaviorEvent,
  Memory,
  MemoryInput,
  RecallOptions,
  Recalled,
  Rule,
  Source,
  Store
} from './store.js'

export interface MemoryEngineOptions {
  store: Store
  embedder: Embedder
  budgetTokens?: number
  hardCap?: number
}

/** 记忆引擎门面（04 §3 API）：摄取 / 召回 / 包裹 / 蒸馏 / 偏好 / 审计。 */
export class MemoryEngine {
  private store: Store
  private embedder: Embedder
  private budgetTokens: number
  private hardCap: number
  private rules = new RuleBook()

  constructor(options: MemoryEngineOptions) {
    this.store = options.store
    this.embedder = options.embedder
    this.budgetTokens = options.budgetTokens ?? 1200
    this.hardCap = options.hardCap ?? 1600
  }

  // —— Store 委托 ——
  init(): void {
    this.store.init()
  }
  addMemory(i: MemoryInput): Memory {
    return this.store.addMemory(i)
  }
  listMemories(): Memory[] {
    return this.store.listMemories()
  }
  addSource(s: Source): void {
    this.store.addSource(s)
  }
  getSources(): Source[] {
    return this.store.getSources()
  }
  recordBehavior(e: BehaviorEvent): void {
    this.store.recordBehavior(e)
  }
  listBehaviorEvents(since?: number): BehaviorEvent[] {
    return this.store.listBehaviorEvents(since)
  }
  getPref(k: string): string | undefined {
    return this.store.getPref(k)
  }
  setPref(k: string, v: string): void {
    this.store.setPref(k, v)
  }
  addAuditSnapshot(s: AuditSnapshot): void {
    this.store.addAuditSnapshot(s)
  }
  listAuditSnapshots(limit?: number): AuditSnapshot[] {
    return this.store.listAuditSnapshots(limit)
  }

  // —— 召回 / 规则 ——
  embed(text: string): number[] {
    return this.embedder.embed(text)
  }
  recall(queryEmbedding: number[], opts?: RecallOptions): Recalled[] {
    return recall(this.store.listMemories(), queryEmbedding, opts)
  }
  activeRules(limit = 20): Rule[] {
    return this.rules.activeRules(limit)
  }
  addRule(input: { kind: string; body: string; confidence: number; sourceEventIds?: string[] }): Rule {
    return this.rules.addRule(input)
  }
  setRuleStatus(id: string, status: Rule['status']): void {
    this.rules.setRuleStatus(id, status)
  }

  /** 幂等摄取：同 uri+checksum 跳过，分块 → 去重 → 嵌入 → 落库。 */
  ingestDocument(uri: string, text: string, tags: string[] = []): { sourceId: string; count: number } {
    const checksum = contentHash(text)
    const existing = this.store.getSources().find((s) => s.uri === uri && s.checksum === checksum)
    if (existing) return { sourceId: existing.id, count: 0 }
    this.store.addSource({ id: uri, uri, kind: 'document', checksum, ingestedAt: Date.now() })
    const chunks = chunkText(text)
    const seen = new Set<string>()
    let count = 0
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i]!
      const h = contentHash(c)
      if (seen.has(h)) continue
      seen.add(h)
      this.store.addMemory({ sourceId: uri, kind: 'chunk', layer: 1, content: c, tags, chunkIndex: i, embedding: this.embedder.embed(c) })
      count++
    }
    return { sourceId: uri, count }
  }

  buildPackage(queryText: string, opts: { k?: number; boostTags?: string[] } = {}): MemoryPackage {
    const qe = this.embedder.embed(queryText)
    return buildMemoryPackage(
      { queryText, memories: this.store.listMemories(), prefs: {}, rules: this.rules.activeRules() },
      qe,
      { budgetTokens: this.optsBudget(), hardCap: this.hardCap, k: opts.k, boostTags: opts.boostTags }
    )
  }

  distill(): Rule[] {
    const cands = distillRules(this.store.listBehaviorEvents())
    const out: Rule[] = []
    for (const c of cands) {
      if (this.rules.all().some((r) => r.body === c.body)) continue
      const added = this.rules.addRule({ kind: c.kind, body: c.body, confidence: c.confidence })
      if (c.confidence < 0.7) this.rules.setRuleStatus(added.id, 'shadow')
      out.push(added)
    }
    return out
  }

  private optsBudget(): number {
    return this.budgetTokens
  }
}