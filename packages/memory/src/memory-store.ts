import type {
  AuditSnapshot,
  BehaviorEvent,
  Memory,
  MemoryInput,
  Source,
  Store
} from './store.js'

let seq = 0
function id(prefix: string): string {
  seq += 1
  return `${prefix}_${Date.now().toString(36)}_${seq.toString(36)}`
}

/** 测试 / 无依赖运行的纯内存实现（生产用 SQLite 适配器，见 desktop 主进程）。 */
export class InMemoryStore implements Store {
  private memories: Memory[] = []
  private sources: Source[] = []
  private events: BehaviorEvent[] = []
  private prefs = new Map<string, string>()
  private snapshots: AuditSnapshot[] = []

  init(): void {}

  addMemory(input: MemoryInput): Memory {
    const m: Memory = {
      id: input.sourceId ? id('mem') : id('mem'),
      sourceId: input.sourceId,
      kind: input.kind,
      layer: input.layer,
      content: input.content,
      tags: input.tags ?? [],
      embedding: input.embedding,
      chunkIndex: input.chunkIndex,
      strength: 1,
      accessCount: 0,
      lastAccessAt: 0,
      createdAt: Date.now()
    }
    this.memories.push(m)
    return m
  }

  listMemories(): Memory[] {
    return [...this.memories]
  }

  addSource(source: Source): void {
    this.sources.push(source)
  }

  getSources(): Source[] {
    return [...this.sources]
  }

  recordBehavior(event: BehaviorEvent): void {
    this.events.push(event)
    // 保留 30 天（04 §5 C6）
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000
    this.events = this.events.filter((e) => e.at >= cutoff)
  }

  listBehaviorEvents(since?: number): BehaviorEvent[] {
    return this.events.filter((e) => since == null || e.at >= since)
  }

  getPref(key: string): string | undefined {
    return this.prefs.get(key)
  }

  setPref(key: string, value: string): void {
    this.prefs.set(key, value)
  }

  addAuditSnapshot(snapshot: AuditSnapshot): void {
    this.snapshots.push(snapshot)
    if (this.snapshots.length > 20) this.snapshots.shift()
  }

  listAuditSnapshots(limit = 20): AuditSnapshot[] {
    return this.snapshots.slice(-limit)
  }
}