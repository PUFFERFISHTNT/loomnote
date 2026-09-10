import { describe, it, expect } from 'vitest'
import { distillRules, RuleBook } from '../src/rules.js'
import type { BehaviorEvent } from '../src/store.js'

function ev(correction: string, domain = 'formula'): BehaviorEvent {
  return { id: Math.random().toString(36), at: Date.now(), kind: 'edit', target: 'note-1', meta: { correction, domain } }
}

describe('distillRules', () => {
  it('单样本不出规则（≥2 正样本铁律）', () => {
    expect(distillRules([ev('公式用单 $')])).toHaveLength(0)
  })

  it('两次同纠正 → 候选规则', () => {
    const r = distillRules([ev('公式用单 $'), ev('公式用单 $')])
    expect(r).toHaveLength(1)
    expect(r[0]!.body).toContain('公式用单 $')
    expect(r[0]!.confidence).toBeGreaterThan(0.7)
  })
})

describe('RuleBook', () => {
  it('状态迁移 + 活跃上限 20', () => {
    const book = new RuleBook()
    const added = book.addRule({ kind: 'correction', body: 'r1', confidence: 0.9 })
    expect(book.activeRules()).toHaveLength(1)
    book.setRuleStatus(added.id, 'shadow')
    expect(book.activeRules()).toHaveLength(0)
  })
})