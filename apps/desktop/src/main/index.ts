import { app, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { MemoryEngine, InMemoryStore, NGramEmbedder } from '@loomnote/memory'
import { parseFrontMatter } from '@loomnote/core'
import { DEFAULT_SETTINGS, type Settings } from '../shared/ipc.js'
import { installSecurityHandlers } from './security.js'
import { openDatabase, newId, type AppDb } from './db.js'
import { registerIpc } from './ipc.js'
import { createAgentHost } from './agent-host.js'

let mainWindow: BrowserWindow | null = null
let db: AppDb | null = null
const settingsStore: Settings = { ...DEFAULT_SETTINGS }
const isSmoke = process.argv.includes('--smoke')
// 截图模式：--screenshot=<route>:<输出png>（UI 视觉审核用，modlens 审图闭环）
const shotArg = process.argv.find((a) => a.startsWith('--screenshot='))
const shotParts = shotArg ? shotArg.slice('--screenshot='.length).split(':') : null
const shotRoute = shotParts?.[0] ?? ''
const shotOut = shotParts?.[1] ?? ''

function createWindow(route?: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    title: '织记 LoomNote',
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
          `model=${settingsStore.model}; apiKeySet=${settingsStore.apiKey.length > 0}; web=${settingsStore.webEnabled}`
      )
      setTimeout(() => app.exit(0), 300)
    })
  }
  if (shotOut) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const probe = await win.webContents.executeJavaScript(
            `JSON.stringify({
              slots: document.querySelectorAll('[data-demo-idx]').length,
              sandboxes: document.querySelectorAll('[data-demo-idx] iframe, .demo-card iframe').length,
              iframeH: (document.querySelector('[data-demo-idx] iframe, .demo-card iframe') || {}).offsetHeight || 0,
              mdChildren: document.querySelector('.md') ? document.querySelector('.md').children.length : -1,
              reactErr: document.querySelector('.demo-invalid') ? document.querySelector('.demo-invalid').textContent.slice(0, 120) : null
            })`
          )
          console.log(`[shot-probe] ${probe}`)
          await win.webContents.executeJavaScript(
            `document.querySelector('[data-demo-idx]')?.scrollIntoView({ block: 'center' })`
          )
          const img = await win.webContents.capturePage()
          fs.mkdirSync(path.dirname(shotOut), { recursive: true })
          fs.writeFileSync(shotOut, img.toPNG())
          console.log(`[shot] ${shotRoute} → ${shotOut} (${img.getSize().width}x${img.getSize().height})`)
        } catch (e) {
          console.error('[shot] failed', e)
        }
        app.exit(0)
      }, 1200)
    })
  }
  return win
}

/** 截图模式：空库时种子一篇富排版示例笔记，保证截到真实内容。 */
function seedDemoNoteForScreenshot(): void {
  if (!shotOut || !db) return
  if (db.listNotes().length > 0) return
  const demoPath = path.join(__dirname, '../../data/demo-note.md')
  if (!fs.existsSync(demoPath)) return
  const text = fs.readFileSync(demoPath, 'utf-8')
  const { frontMatter, body } = parseFrontMatter(text)
  const now = Date.now()
  db.saveNote({
    id: newId(),
    title: (frontMatter.title as string | undefined) ?? '示例 · 0-1 背包问题',
    bodyMd: body,
    frontMatter,
    status: 'draft',
    createdAt: now,
    updatedAt: now
  })
}

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
    if (process.env.LOOMNOTE_DATA_DIR) app.setPath('userData', process.env.LOOMNOTE_DATA_DIR)
    db = openDatabase(app.getPath('userData'))
    const saved = db.getSetting('settings')
    if (saved) {
      try {
        Object.assign(settingsStore, JSON.parse(saved) as Partial<Settings>)
      } catch {
        /* keep defaults */
      }
    }
    // 环境变量覆盖（一键启动脚本注入，优先级最高；对 SQLite/JSON 两种后端都生效）
    if (process.env.LOOMNOTE_API_KEY) settingsStore.apiKey = process.env.LOOMNOTE_API_KEY
    if (process.env.LOOMNOTE_BASE_URL) settingsStore.baseURL = process.env.LOOMNOTE_BASE_URL
    if (process.env.LOOMNOTE_MODEL) settingsStore.model = process.env.LOOMNOTE_MODEL
    if (process.env.LOOMNOTE_WEB_ENABLED !== undefined) settingsStore.webEnabled = ['1', 'true'].includes(process.env.LOOMNOTE_WEB_ENABLED.toLowerCase())
    const memory = new MemoryEngine({ store: new InMemoryStore(), embedder: new NGramEmbedder(128) })
    const agentHost = createAgentHost(db, memory, () => settingsStore)

    registerIpc({
      db,
      memory,
      agentHost,
      getWindow: () => mainWindow,
      getSettings: () => settingsStore,
      setSettings: (s) => {
        Object.assign(settingsStore, s)
        db?.setSetting('settings', JSON.stringify(settingsStore))
      }
    })

    seedDemoNoteForScreenshot()
    mainWindow = createWindow(shotRoute || undefined)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    db?.close()
  })
}