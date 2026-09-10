import { describe, it, expect } from 'vitest'
import { isSettings } from '../src/shared/ipc.js'

describe('ipc 入参校验（07 §5）', () => {
  it('isSettings 校验合法与非法', () => {
    expect(isSettings({ baseURL: 'http://x', apiKey: 'k', model: 'm', webEnabled: true, maxTokens: 4096 })).toBe(true)
    expect(isSettings({ baseURL: 'http://x', apiKey: 'k', model: 'm', webEnabled: true })).toBe(false)
    expect(isSettings({ baseURL: 'http://x' })).toBe(false)
    expect(isSettings(null)).toBe(false)
    expect(isSettings({ baseURL: 1, apiKey: 'k', model: 'm', webEnabled: true, maxTokens: 4096 })).toBe(false)
  })
})