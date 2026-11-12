import { afterEach, describe, expect, it, vi } from 'vitest'
import { testProvider } from '../src/main/provider.js'
import { DEFAULT_SETTINGS, isSettings } from '../src/shared/ipc.js'

afterEach(() => vi.unstubAllGlobals())
const provider = { ...DEFAULT_SETTINGS.providers[0]!, model: 'study-model', apiKey: 'test-credential' }
describe('provider connection check', () => {
  it('checks the configured model without making a generation request', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'study-model' }] })))
    vi.stubGlobal('fetch', fetch)
    expect((await testProvider(provider)).ok).toBe(true)
    expect(fetch.mock.calls[0]![0]).toBe('https://api.deepseek.com/v1/models')
    expect(fetch.mock.calls[0]![1]).toMatchObject({ redirect: 'error', headers: { Authorization: 'Bearer test-credential' } })
  })
  it.each([401, 403, 404, 429, 500])('reports HTTP %i without exposing response secrets', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private provider details', { status })))
    const result = await testProvider(provider)
    expect(result.ok).toBe(false)
    expect(result.message).toContain(String(status))
    expect(result.message).not.toContain('private')
    expect(result.message).not.toContain(provider.apiKey)
  })
  it('reports missing models, invalid JSON and network failures clearly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"data":[]}')))
    expect((await testProvider(provider)).message).toMatch(/not listed/)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('secret URL')))
    expect((await testProvider(provider)).message).not.toContain('secret URL')
  })
  it('rejects invalid endpoint schemes and output limits before network access', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    expect((await testProvider({ ...provider, baseURL: 'file:///etc/passwd' })).ok).toBe(false)
    expect(isSettings({ ...DEFAULT_SETTINGS, providers: [{ ...provider, maxTokens: Number.NaN }] })).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })
})
