import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { MemoryEngine, InMemoryStore, NGramEmbedder } from '@loomnote/memory'
import { DEFAULT_SETTINGS, IPC, getActiveProvider, migrateSettings, type Settings } from '../shared/ipc.js'
import { installSecurityHandlers } from './security.js'
import { installWorkspaceProtocol, registerWorkspaceScheme } from './protocol.js'
import { disposeDemoRig } from './demo-verify.js'
import { openDatabase, type AppDb } from './db.js'
import { registerIpc } from './ipc.js'
import { createChatHost, type ChatHost } from './harness-host.js'
import { createWorkspace } from './workspace.js'

let mainWindow: BrowserWindow | null = null
let db: AppDb | null = null
/** Kept at module scope so `before-quit` can tear the harness child down. */
let chatHostRef: ChatHost | null = null
const settingsStore: Settings = { ...DEFAULT_SETTINGS }
const isSmoke = process.argv.includes('--smoke')

function createWindow(route?: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    title: 'LoomNote',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(route ? `${devUrl}#${route}` : devUrl)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'), route ? { hash: route } : undefined)
  }
  win.on('closed', () => {
    mainWindow = null
  })
  if (isSmoke) {
    win.webContents.once('did-finish-load', () => {
      console.log(
        `[smoke] renderer loaded; platform=${process.platform}; health=${JSON.stringify(db?.health() ?? {})}; ` +
          `model=${getActiveProvider(settingsStore).model}; apiKeySet=${getActiveProvider(settingsStore).apiKey.length > 0}; web=${settingsStore.webEnabled}`
      )
      setTimeout(() => app.exit(0), 300)
    })
  }
  return win
}



// Must run before the app is ready: a scheme that is not privileged up front is
// opaque to fetch, and the note's own images would never load.
registerWorkspaceScheme()

// Lock identity is derived from userData. Set it first so isolated test or
// recording libraries do not focus/terminate an unrelated study instance.
if (process.env.LOOMNOTE_DATA_DIR) app.setPath('userData', process.env.LOOMNOTE_DATA_DIR)
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  void app.whenReady().then(async () => {
    // PDF 链路构建产物自检：--pdftest=<file> → 输出提取字符数与开头片段后退出
    const pdfTestArg = process.argv.find((a) => a.startsWith('--pdftest='))
    if (pdfTestArg) {
      setTimeout(() => {
        console.error('[pdftest] TIMEOUT after 30s')
        app.exit(2)
      }, 30000)
      const file = pdfTestArg.slice('--pdftest='.length)
      const { parseDocument } = await import('./parse.js')
      const r = await parseDocument(file)
      console.log(`[pdftest] kind=${r.kind} chars=${r.text.length} head=${JSON.stringify(r.text.slice(0, 100))}`)
      app.exit(0)
      return
    }
    installSecurityHandlers()
    db = openDatabase(app.getPath('userData'))
    const saved = db.getSetting('settings')
    if (saved) {
      try {
        Object.assign(settingsStore, migrateSettings(JSON.parse(saved)))
      } catch {
        Object.assign(settingsStore, migrateSettings(undefined))
      }
    }
    // 环境变量覆盖（一键启动脚本注入，优先级最高；作用于当前激活的接口）
    const active = getActiveProvider(settingsStore)
    if (process.env.LOOMNOTE_API_KEY) active.apiKey = process.env.LOOMNOTE_API_KEY
    if (process.env.LOOMNOTE_BASE_URL) active.baseURL = process.env.LOOMNOTE_BASE_URL
    if (process.env.LOOMNOTE_MODEL) active.model = process.env.LOOMNOTE_MODEL
    if (process.env.LOOMNOTE_MAX_TOKENS) active.maxTokens = Number(process.env.LOOMNOTE_MAX_TOKENS) || active.maxTokens
    if (process.env.LOOMNOTE_WEB_ENABLED !== undefined) settingsStore.webEnabled = ['1', 'true'].includes(process.env.LOOMNOTE_WEB_ENABLED.toLowerCase())
    // 界面语言：LOOMNOTE_LANG 优先，其次系统语言（中文系统 → 中文，其余 → 英文）
    const envLang = process.env.LOOMNOTE_LANG === 'zh' || process.env.LOOMNOTE_LANG === 'en' ? (process.env.LOOMNOTE_LANG as 'zh' | 'en') : null
    if (envLang) settingsStore.lang = envLang
    else if (settingsStore.lang !== 'zh' && settingsStore.lang !== 'en') settingsStore.lang = app.getLocale().toLowerCase().startsWith('zh') ? 'zh' : 'en'
    const memory = new MemoryEngine({ store: new InMemoryStore(), embedder: new NGramEmbedder(128) })

    // The agent, its sessions and the note files all live under the app's own
    // user-data directory: nothing the harness persists leaves this machine.
    const userData = app.getPath('userData')
    const workspace = createWorkspace(path.join(userData, 'workspaces'))
    installWorkspaceProtocol(workspace)
    const chatHost: ChatHost = createChatHost({
      db,
      workspace,
      dshHome: path.join(userData, 'harness'),
      getSettings: () => settingsStore,
      onEvent: (payload) => {
        mainWindow?.webContents.send(IPC.chatEvent, payload)
      },
      onNoteBody: (noteId, bodyMd) => mainWindow?.webContents.send(IPC.noteLive, { noteId, bodyMd })
    })
    chatHostRef = chatHost

    registerIpc({
      db,
      memory,
      chatHost,
      workspace,
      getWindow: () => mainWindow,
      getSettings: () => settingsStore,
      setSettings: (s) => {
        Object.assign(settingsStore, s)
        db?.setSetting('settings', JSON.stringify(settingsStore))
      }
    })

    mainWindow = createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    // All three are idempotent and cheap; nothing may outlive the window: not
    // the harness child, not the offscreen demo rig.
    chatHostRef?.disposeAll()
    disposeDemoRig()
    db?.close()
  })
}
