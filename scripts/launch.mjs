// Shared Windows/macOS launcher: prepare, build and open the real desktop app.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtime = path.join(root, '.runtime')
const pnpm = path.join(runtime, 'pnpm/node_modules/pnpm/bin/pnpm.cjs')
const pnpmVersion = JSON.parse(readFileSync(path.join(root, 'package.json'))).packageManager.split('@')[1]
const node = realpathSync(process.execPath)
const localBins = path.join(runtime, 'pnpm/node_modules/.bin')
const inheritedPath = Object.entries(process.env).find(([name]) => name.toLowerCase() === 'path')?.[1] ?? ''
const env = { ...process.env, LOOMNOTE_NODE: node }
// pnpm itself is launched with Node, but package scripts call `pnpm` again.
// Expose its local shims to every child so a fresh PC needs no global tools.
// Use one PATH key: Windows treats Path/PATH as the same environment variable.
for (const name of Object.keys(env)) if (name.toLowerCase() === 'path') delete env[name]
env.PATH = [localBins, path.dirname(node), inheritedPath].filter(Boolean).join(path.delimiter)
delete env.ELECTRON_RUN_AS_NODE
for (const name of Object.keys(env)) if (/(?:API_KEY|TOKEN|SECRET|PASSWORD)$/i.test(name)) delete env[name]
// Node's fetch does not use HTTP(S)_PROXY by default. Honour an explicitly
// configured download proxy for setup without changing the app's networking.
const installEnv = { ...env }
if (['HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy'].some((name) => installEnv[name])) {
  installEnv.NODE_USE_ENV_PROXY ??= '1'
}
const main = path.join(root, 'apps/desktop/out/main/index.js')
const electron = path.join(root, 'apps/desktop/node_modules/electron/dist', process.platform === 'win32' ? 'electron.exe' : process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : 'electron')
const stateFile = path.join(runtime, 'setup-state.json')

async function run(binary, args, childEnv = installEnv) {
  await new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: root, env: childEnv, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${path.basename(binary)} exited with ${signal ?? code}`)))
  })
}

function fingerprint() {
  const hash = createHash('sha256').update(`${process.platform}/${process.arch}/${pnpmVersion}`)
  const visit = (relative) => {
    const absolute = path.join(root, relative)
    if (!existsSync(absolute)) return
    for (const entry of readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (['node_modules', 'out', 'dist', '.DS_Store'].includes(entry.name)) continue
      const name = `${relative}/${entry.name}`
      if (entry.isDirectory()) visit(name)
      else if (entry.isFile()) hash.update(name).update(readFileSync(path.join(root, name)))
    }
  }
  for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', 'tsconfig.base.json']) hash.update(readFileSync(path.join(root, file)))
  visit('apps'); visit('packages')
  return hash.digest('hex')
}

async function ensurePnpm() {
  if (existsSync(pnpm) && JSON.parse(readFileSync(path.join(runtime, 'pnpm/node_modules/pnpm/package.json'))).version === pnpmVersion) return
  const nodeDir = path.dirname(node)
  const candidates = [path.join(nodeDir, 'node_modules/npm/bin/npm-cli.js'), path.resolve(nodeDir, '../lib/node_modules/npm/bin/npm-cli.js')]
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const npm = path.join(dir, process.platform === 'win32' ? 'npm.cmd' : 'npm')
    if (existsSync(npm)) {
      const resolved = realpathSync(npm)
      candidates.push(resolved.endsWith('.js') ? resolved : path.join(path.dirname(resolved), 'node_modules/npm/bin/npm-cli.js'))
    }
  }
  const npmCli = candidates.find((candidate) => existsSync(candidate))
  if (!npmCli) throw new Error('npm is missing from this Node installation. Install the official Node.js distribution or remove LOOMNOTE_NODE to use the local runtime.')
  console.log(`Preparing local pnpm ${pnpmVersion}...`)
  await run(node, [npmCli, 'install', '--prefix', path.join(runtime, 'pnpm'), '--no-save', '--package-lock=false', '--ignore-scripts', '--no-audit', '--no-fund', `--registry=${process.env.LOOMNOTE_REGISTRY ?? 'https://registry.npmjs.org/'}`, `pnpm@${pnpmVersion}`])
}

try {
  if (Number(process.versions.node.split('.')[0]) < 24 || process.versions.electron) throw new Error('LoomNote needs plain Node.js 24+. Use start.command or start.cmd to prepare it automatically.')
  await mkdir(runtime, { recursive: true })
  const current = fingerprint()
  let saved
  try { saved = JSON.parse(readFileSync(stateFile, 'utf8')).fingerprint } catch {}
  if (process.argv.includes('--setup') || current !== saved || !existsSync(main) || !existsSync(electron)) {
    await ensurePnpm()
    console.log('Installing the locked application dependencies...')
    installEnv.CI = 'true'
    await run(node, [pnpm, 'install', '--frozen-lockfile'])
    await run(node, [pnpm, 'setup:electron'])
    await run(node, [pnpm, 'build'])
    if (!existsSync(main) || !existsSync(electron)) throw new Error('The build did not produce a runnable desktop app. Read the output above and retry.')
    await writeFile(stateFile, JSON.stringify({ fingerprint: current }, null, 2))
  }
  if (process.argv.includes('--setup')) console.log('LoomNote is ready. Double-click start.command (macOS) or start.cmd (Windows).')
  else {
    console.log('Opening LoomNote. Configure your model in Settings, or open the offline sample.')
    // Credentials are read only after installation/build and reach the app only.
    const appEnv = { ...env }
    for (const [name, value] of Object.entries(process.env)) if (/^(LOOMNOTE_|DEEPSEEK_API_KEY$)/.test(name)) appEnv[name] = value
    appEnv.LOOMNOTE_NODE = node
    const localEnv = path.join(root, 'config/local.env')
    if (existsSync(localEnv)) {
      for (const line of readFileSync(localEnv, 'utf8').split(/\r?\n/)) {
        const match = /^(LOOMNOTE_(?:API_KEY|BASE_URL|MODEL|MAX_TOKENS|WEB_ENABLED|DATA_DIR|LANG))=(.*)$/.exec(line.trim())
        if (match && appEnv[match[1]] === undefined) appEnv[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
      }
    }
    await run(electron, [main, ...process.argv.slice(2)], appEnv)
  }
} catch (error) {
  console.error(`LoomNote: ${error.message}\nCheck your network and retry. The application keeps study data in your OS user-data directory.`)
  process.exitCode = 1
}
