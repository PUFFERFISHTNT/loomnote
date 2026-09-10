export type MemoryStoreContract = Store & RecallProvider & RuleProvider

export interface Store {
  init(): void
  addMemory(input: MemoryInput): Memory
  listMemories(): Memory[]
  addSource(source: Source): void
  getSources(): Source[]
  recordBehavior(event: BehaviorEvent): void
  listBehaviorEvents(since?: number): BehaviorEvent[]
  getPref(key: string): string | undefined
  setPref(key: string, value: string): void
  addAuditSnapshot(snapshot: AuditSnapshot): void
  listAuditSnapshots(limit?: number): AuditSnapshot[]
}

export interface MemoryInput {
  sourceId?: string
  kind: Memory['kind']
  layer: Memory['layer']
  content: string
  tags?: string[]
  embedding?: number[]
  chunkIndex?: number
}

export interface Memory {
  id: string
  sourceId?: string
  kind: 'chunk' | 'summary' | 'preference' | 'rule'
  layer: 1 | 2 | 3
  content: string
  tags: string[]
  embedding?: number[]
  chunkIndex?: number
  strength: number
  accessCount: number
  lastAccessAt: number
  createdAt: number
}

export interface Source {
  id: string
  uri: string
  kind: string
  checksum: string
  ingestedAt: number
}

export interface BehaviorEvent {
  id: string
  at: number
  kind: 'accept' | 'edit' | 'regenerate'
  target: string
  meta?: { correction?: string; domain?: string }
}

export interface AuditSnapshot {
  id: string
  at: number
  requestBrief: string
  body: string
}

export interface RecallProvider {
  recall(queryEmbedding: number[], opts?: RecallOptions): Recalled[]
}

export interface RuleProvider {
  activeRules(limit?: number): Rule[]
  addRule(input: { kind: string; body: string; confidence: number; sourceEventIds?: string[] }): Rule
  setRuleStatus(id: string, status: Rule['status']): void
}

export interface RecallOptions {
  k?: number
  minScore?: number
  boostTags?: string[]
  boostFactor?: number
  graphNeighbors?: (id: string) => string[]
  behaviorCooc?: Record<string, string[]>
}

export interface Recalled {
  memory: Memory
  score: number
  channel: 'vector' | 'graph' | 'behavior'
}

export type RuleStatus = 'active' | 'shadow' | 'off'

export interface Rule {
  id: string
  kind: string
  body: string
  sourceEventIds: string[]
  confidence: number
  status: RuleStatus
  ver: number
  createdAt: number
}