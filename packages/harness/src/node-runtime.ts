/**
 * Locating a Node.js runtime for the harness child process.
 *
 * The harness runtime loads native add-ons whose loader supports plain Node
 * only: under an Electron-as-node binary it refuses to start with
 * `node-addon-require-builtin unsupported`. That makes the choice of runtime a
 * product concern rather than an implementation detail, so this module owns
 * discovery, validation and the actionable error message.
 *
 * @module
 */

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

/** Minimum plain-Node major version the harness runtime accepts. */
export const MIN_NODE_MAJOR = 24

/** A validated Node.js runtime. */
export interface NodeRuntime {
  /** Absolute path to the executable, or the bare name when PATH-resolved. */
  path: string
  /** `process.version`, e.g. `v26.11.1`. */
  version: string
  /** Parsed major version. */
  major: number
}

/** Result of asking a candidate what it is. */
export interface NodeProbe {
  path: string
  version: string
  major: number
  /** True when the candidate is an Electron binary running as Node. */
  electron: boolean
}

const PROBE_SCRIPT = 'process.stdout.write(JSON.stringify({v:process.version,e:!!(process.versions&&process.versions.electron)}))'

/**
 * Parse the JSON a candidate printed for {@link PROBE_SCRIPT}.
 * @param raw - stdout of the probe.
 * @returns the parsed facts, or `null` when the output is not the expected shape.
 */
export function parseProbeOutput(raw: string): { version: string; major: number; electron: boolean } | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const rec = parsed as Record<string, unknown>
  const version = typeof rec['v'] === 'string' ? rec['v'] : ''
  const major = Number.parseInt(version.replace(/^v/, '').split('.')[0] ?? '', 10)
  if (!version || !Number.isFinite(major)) return null
  return { version, major, electron: rec['e'] === true }
}

/**
 * Ask one candidate binary what it is.
 * @param candidate - executable path or PATH-resolvable name.
 * @param timeoutMs - probe deadline; a hung candidate must not stall startup.
 * @returns the probe result, or `null` when the binary is missing or unusable.
 */
export async function probeNode(candidate: string, timeoutMs = 4000): Promise<NodeProbe | null> {
  return new Promise((resolve) => {
    execFile(candidate, ['-p', PROBE_SCRIPT], { timeout: timeoutMs, windowsHide: true }, (error, stdout) => {
      if (error) {
        resolve(null)
        return
      }
      const parsed = parseProbeOutput(String(stdout))
      resolve(parsed ? { path: candidate, ...parsed } : null)
    })
  })
}

/** Options narrowing discovery; every field has a production default. */
export interface ResolveNodeOptions {
  /** Explicit override; wins unconditionally when it validates. */
  override?: string | undefined
  /** Extra candidates tried before the PATH scan (e.g. a packaged runtime). */
  extra?: readonly string[]
  /** Environment used for PATH and `LOOMNOTE_NODE`. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv
  /** `process.execPath`; skipped when it is an Electron binary. Defaults to `process.execPath`. */
  execPath?: string
  /** Whether `execPath` runs under Electron. Defaults to detecting `process.versions.electron`. */
  execIsElectron?: boolean
  /** Per-candidate probe deadline. */
  probeTimeoutMs?: number
}

/** Absolute directories worth trying on each platform, in order. */
function wellKnownPaths(env: NodeJS.ProcessEnv): string[] {
  const home = env['HOME'] ?? env['USERPROFILE'] ?? ''
  const dirs =
    process.platform === 'win32'
      ? [
          path.join(env['ProgramFiles'] ?? 'C:\\Program Files', 'nodejs'),
          path.join(env['LOCALAPPDATA'] ?? '', 'Programs', 'nodejs'),
          path.join(env['APPDATA'] ?? '', 'npm')
        ]
      : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', path.join(home, '.local', 'bin'), path.join(home, 'node', 'bin'), path.join(home, '.nvm', 'current', 'bin')]
  const exe = process.platform === 'win32' ? 'node.exe' : 'node'
  return dirs.filter((d) => d.length > 0).map((d) => path.join(d, exe))
}

/**
 * Build the ordered candidate list. Deduplicated, and Electron binaries are
 * dropped rather than probed: they are known to fail, and probing each one
 * costs a process spawn.
 * @param options - discovery inputs.
 * @returns candidate paths, most-preferred first.
 */
export function nodeCandidates(options: ResolveNodeOptions = {}): string[] {
  const env = options.env ?? process.env
  const execIsElectron = options.execIsElectron ?? Boolean(process.versions && process.versions.electron)
  const execPath = options.execPath ?? process.execPath

  const ordered: string[] = []
  const override = options.override ?? env['LOOMNOTE_NODE']
  if (override) ordered.push(override)
  if (options.extra) ordered.push(...options.extra)
  if (!execIsElectron && execPath) ordered.push(execPath)
  ordered.push(...wellKnownPaths(env))

  const pathEntries = (env['PATH'] ?? env['Path'] ?? '').split(path.delimiter).filter((entry) => entry.length > 0)
  const exe = process.platform === 'win32' ? 'node.exe' : 'node'
  for (const entry of pathEntries) ordered.push(path.join(entry, exe))
  ordered.push(exe)

  const seen = new Set<string>()
  const unique: string[] = []
  for (const candidate of ordered) {
    const key = process.platform === 'win32' ? candidate.toLowerCase() : candidate
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(candidate)
  }
  return unique
}

/** Raised when no acceptable Node.js runtime exists on this machine. */
export class NodeRuntimeNotFoundError extends Error {
  readonly tried: readonly string[]

  constructor(tried: readonly string[], reasons: readonly string[]) {
    super(
      [
        `LoomNote's agent runtime needs a plain Node.js ${MIN_NODE_MAJOR}+ executable and could not find one.`,
        'Electron ships its own Node, but the harness native add-ons refuse to load under it, so a system Node is required.',
        'Install Node.js 24 or newer (https://nodejs.org), or point LOOMNOTE_NODE at one, then restart LoomNote.',
        '',
        `Tried: ${tried.slice(0, 8).join(', ')}${tried.length > 8 ? ` (+${tried.length - 8} more)` : ''}`,
        ...reasons.slice(0, 3).map((reason) => `  - ${reason}`)
      ].join('\n')
    )
    this.name = 'NodeRuntimeNotFoundError'
    this.tried = tried
  }
}

/**
 * Find the first candidate that is a plain Node.js of an acceptable version.
 * @param options - discovery inputs.
 * @returns the validated runtime.
 * @throws {NodeRuntimeNotFoundError} when nothing qualifies, listing what was tried and why each failed.
 */
export async function resolveNodeRuntime(options: ResolveNodeOptions = {}): Promise<NodeRuntime> {
  const candidates = nodeCandidates(options)
  const reasons: string[] = []
  for (const candidate of candidates) {
    if (candidate.includes(path.sep) && !existsSync(candidate)) continue
    const probe = await probeNode(candidate, options.probeTimeoutMs)
    if (!probe) {
      reasons.push(`${candidate}: not executable or not a Node binary`)
      continue
    }
    if (probe.electron) {
      reasons.push(`${candidate}: Electron ${probe.version} — native add-ons require plain Node`)
      continue
    }
    if (probe.major < MIN_NODE_MAJOR) {
      reasons.push(`${candidate}: Node ${probe.version} is older than ${MIN_NODE_MAJOR}`)
      continue
    }
    return { path: probe.path, version: probe.version, major: probe.major }
  }
  throw new NodeRuntimeNotFoundError(candidates, reasons)
}
