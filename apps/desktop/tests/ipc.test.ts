import { describe, it, expect } from 'vitest'
import { getActiveProvider, isSettings, migrateSettings } from '../src/shared/ipc.js'

describe('ipc 入参校验（07 §5）', () => {
  it('isSettings 校验合法与非法（多接口结构）', () => {
    const good = {
      providers: [{ id: 'a', name: 'A', baseURL: 'http://x', apiKey: 'k', model: 'm', maxTokens: 4096 }],
      activeProviderId: 'a',
      webEnabled: true
    }
    expect(isSettings(good)).toBe(true)
    expect(isSettings({ providers: [], activeProviderId: 'a', webEnabled: true })).toBe(false)
    expect(isSettings({ providers: [{ id: 'a', name: 'A', baseURL: 1, apiKey: 'k', model: 'm', maxTokens: 4096 }], activeProviderId: 'a', webEnabled: true })).toBe(false)
    expect(isSettings(null)).toBe(false)
  })

  it('getActiveProvider 回退与命中', () => {
    const s = {
      providers: [
        { id: 'deepseek-official', name: 'DeepSeek 官方 API', baseURL: 'https://api.deepseek.com/v1', apiKey: '', model: 'deepseek-chat', maxTokens: 8192 },
        { id: 'volc-ark-coding', name: '火山方舟 Coding Plan', baseURL: 'https://ark.cn-beijing.volces.com/api/coding/v3', apiKey: '', model: 'deepseek-v4-flash', maxTokens: 4096 }
      ],
      activeProviderId: 'volc-ark-coding',
      webEnabled: true
    }
    expect(getActiveProvider(s).name).toBe('火山方舟 Coding Plan')
    expect(getActiveProvider({ ...s, activeProviderId: 'missing' }).id).toBe('deepseek-official')
  })

  it('migrateSettings 把旧单接口设置迁移为多接口', () => {
    const migrated = migrateSettings({ baseURL: 'http://legacy', apiKey: 'KEY', model: 'm1', maxTokens: 2048, webEnabled: false })
    expect(migrated.providers.length).toBeGreaterThanOrEqual(1)
    expect(migrated.providers[0]!.baseURL).toBe('http://legacy')
    expect(migrated.activeProviderId).toBe('volc-ark-coding')
    expect(migrated.webEnabled).toBe(false)
  })
})