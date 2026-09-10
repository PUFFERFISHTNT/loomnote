import type { BehaviorEvent, Rule } from './store.js'

let seq = 0
function nextId(): string {
  seq += 1
  return `E${Date.now().toString(36)}_${seq.toString(36)}`
}

/**
 * 蒸馏（04 §2.3 Mem0 化简化版）：把「edit 类型带 correction 的纠正」按 domain+correction 聚合，
 * ≥2 条正样本 → 候选规则（≥2 正样本铁律）。
 */
export function distillRules(events: BehaviorEvent[], minSamples = 2, limit = 8): Array<{ kind: string; body: string; confidence: number; sampleCount: number }> {
  const buckets = new Map<string, { body: string; count: number }>()
  for (const ev of events) {
    if (ev.kind !== 'edit' || !ev.meta?.correction) continue
    const domain = ev.meta.domain ?? 'general'
    const key = `${domain}::${ev.meta.correction.trim()}`
    const cur = buckets.get(key)
    if (cur) cur.count += 1
    else buckets.set(key, { body: `在「${domain}」场景：${ev.meta.correction.trim()}`, count: 1 })
  }
  const out = [...buckets.entries()]
    .filter(([, v]) => v.count >= minSamples)
    .map(([, v]) => ({
      kind: 'correction',
      body: v.body,
      confidence: Math.min(1, 0.5 + v.count * 0.15),
      sampleCount: v.count
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit)
  return out
}

/** L4 规则库：新增（带版本）、状态迁移（active⇄shadow⇄off）、活跃总数 ≤20（04 §5）。 */
export class RuleBook {
  private rules: Rule[] = []
  private ver = 0

  activeRules(limit = 20): Rule[] {
    return this.rules.filter((r) => r.status === 'active').slice(-limit)
  }

  addRule(input: { kind: string; body: string; confidence: number; sourceEventIds?: string[] }): Rule {
    this.ver += 1
    const rule: Rule = {
      id: nextId(),
      kind: input.kind,
      body: input.body,
      sourceEventIds: input.sourceEventIds ?? [],
      confidence: input.confidence,
      status: 'active',
      ver: this.ver,
      createdAt: Date.now()
    }
    this.rules.push(rule)
    return rule
  }

  setRuleStatus(id: string, status: Rule['status']): void {
    const r = this.rules.find((x) => x.id === id)
    if (r) {
      this.ver += 1
      r.status = status
      r.ver = this.ver
    }
  }

  all(): Rule[] {
    return [...this.rules]
  }
}