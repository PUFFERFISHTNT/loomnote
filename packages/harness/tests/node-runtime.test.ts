import { describe, expect, it } from 'vitest'
import { MIN_NODE_MAJOR, NodeRuntimeNotFoundError, nodeCandidates, parseProbeOutput, probeNode, resolveNodeRuntime } from '../src/node-runtime.js'

describe('reading a runtime probe', () => {
  it('parses a plain Node answer', () => {
    expect(parseProbeOutput('{"v":"v26.11.1","e":false}')).toEqual({ version: 'v26.11.1', major: 26, electron: false })
  })

  it('flags an Electron binary, which the native add-ons reject', () => {
    expect(parseProbeOutput('{"v":"v24.18.1","e":true}')?.electron).toBe(true)
  })

  it('returns null for anything that is not the expected shape', () => {
    expect(parseProbeOutput('')).toBeNull()
    expect(parseProbeOutput('not json')).toBeNull()
    expect(parseProbeOutput('{"e":false}')).toBeNull()
    expect(parseProbeOutput('{"v":"weird","e":false}')).toBeNull()
  })
})

describe('choosing candidates', () => {
  it('puts the explicit override first and never duplicates', () => {
    const candidates = nodeCandidates({ override: '/opt/custom/node', env: { PATH: '/usr/bin:/usr/bin' }, execPath: '/usr/bin/node', execIsElectron: false })
    expect(candidates[0]).toBe('/opt/custom/node')
    expect(new Set(candidates).size).toBe(candidates.length)
  })

  it('accepts the LOOMNOTE_NODE environment variable as an override', () => {
    const candidates = nodeCandidates({ env: { LOOMNOTE_NODE: '/env/node', PATH: '' }, execPath: '', execIsElectron: true })
    expect(candidates[0]).toBe('/env/node')
  })

  it('drops an Electron execPath and searches PATH instead', () => {
    const candidates = nodeCandidates({ env: { PATH: '/a/bin:/b/bin' }, execPath: '/Applications/App.app/Contents/MacOS/App', execIsElectron: true })
    expect(candidates).not.toContain('/Applications/App.app/Contents/MacOS/App')
    expect(candidates.some((c) => c.startsWith('/a/bin'))).toBe(true)
    expect(candidates.some((c) => c.startsWith('/b/bin'))).toBe(true)
  })
})

describe('probing a binary', () => {
  it('reports nothing for a path that does not exist', async () => {
    await expect(probeNode('/definitely/not/a/node/binary')).resolves.toBeNull()
  })
})

describe('resolving the runtime', () => {
  it('explains what to install instead of failing obscurely', () => {
    const error = new NodeRuntimeNotFoundError(['/a/node', '/b/node'], ['/a/node: Electron 43.4.0 — native add-ons require plain Node'])
    expect(error).toBeInstanceOf(NodeRuntimeNotFoundError)
    expect(error.message).toContain(`Node.js ${MIN_NODE_MAJOR}+`)
    expect(error.message).toContain('LOOMNOTE_NODE')
    expect(error.message).toContain('Electron ships its own Node')
    expect(error.message).toContain('/a/node')
    expect(error.tried).toEqual(['/a/node', '/b/node'])
  })

  it('survives a bad override and falls back to a real Node on this machine', async () => {
    const runtime = await resolveNodeRuntime({ override: '/definitely/not/node' })
    expect(runtime.major).toBeGreaterThanOrEqual(MIN_NODE_MAJOR)
    expect(runtime.path).not.toBe('/definitely/not/node')
  })
})
