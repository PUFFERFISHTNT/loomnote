import { isProviderConfig, type ProviderConfig, type ProviderTestResult } from '../shared/ipc.js'

/** Checks authentication and model availability without generating tokens. */
export async function testProvider(provider: ProviderConfig): Promise<ProviderTestResult> {
  const start = Date.now()
  const finish = (ok: boolean, message: string): ProviderTestResult => ({ ok, message, latencyMs: Date.now() - start })
  if (!isProviderConfig(provider)) return finish(false, 'Enter a valid HTTP(S) endpoint, model and positive output limit.')
  try {
    const response = await fetch(`${provider.baseURL.replace(/\/+$/, '')}/models`, {
      headers: provider.apiKey.trim() ? { Authorization: `Bearer ${provider.apiKey.trim()}` } : {},
      signal: AbortSignal.timeout(15_000), redirect: 'error'
    })
    if (!response.ok) {
      const reason = response.status === 401 || response.status === 403 ? 'Check the API key and permissions.' : response.status === 404 ? 'This endpoint does not expose /models; check its base URL or provider documentation.' : response.status === 429 ? 'The provider is rate limiting requests. Try again later.' : 'The provider could not complete the check.'
      return finish(false, `HTTP ${response.status}. ${reason}`)
    }
    const body = await response.json() as { data?: Array<{ id?: string }> }
    if (!Array.isArray(body.data)) return finish(false, 'The endpoint did not return an OpenAI-compatible model list.')
    if (!body.data.some((m) => m.id === provider.model)) return finish(false, 'Connected, but the configured model is not listed. Check the model name with your provider.')
    return finish(true, 'Connected; the configured model is available. Text generation and tool support are not tested by this check.')
  } catch (error) {
    // Do not echo provider response bodies or URLs: they can contain credentials.
    return finish(false, error instanceof Error && /timeout|abort/i.test(error.name) ? 'The connection timed out after 15 seconds.' : 'Could not reach the endpoint. Check the network and base URL.')
  }
}
