import { app, BrowserWindow, screen } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { MemoryEngine, InMemoryStore, NGramEmbedder } from '@loomnote/memory'
import { parseFrontMatter } from '@loomnote/core'
import { DEFAULT_SETTINGS, IPC, getActiveProvider, migrateSettings, type Settings } from '../shared/ipc.js'
import { installSecurityHandlers } from './security.js'
import { installWorkspaceProtocol, registerWorkspaceScheme } from './protocol.js'
import { disposeDemoRig } from './demo-verify.js'
import { openDatabase, newId, type AppDb } from './db.js'
import { registerIpc } from './ipc.js'
import { createChatHost, type ChatHost } from './harness-host.js'
import { createWorkspace, type NoteWorkspace } from './workspace.js'

let mainWindow: BrowserWindow | null = null
let db: AppDb | null = null
/** Kept at module scope so `before-quit` can tear the harness child down. */
let chatHostRef: ChatHost | null = null
const settingsStore: Settings = { ...DEFAULT_SETTINGS }
const isSmoke = process.argv.includes('--smoke')
/**
 * Scripted walkthrough driver: `--demo=<pdf>|<request>`.
 *
 * It exists so the one-minute review recording is reproducible instead of
 * hand-acted. Every step goes through the same code paths a click uses — the
 * import handler, then the chat host's own `send` — so what the recording shows
 * is the live system, not a mock.
 */
const demoArg = process.argv.find((a) => a.startsWith('--demo='))
const demoSep = demoArg ? demoArg.indexOf('|', '--demo='.length) : -1
const demoPdf = demoArg && demoSep > 0 ? demoArg.slice('--demo='.length, demoSep) : null
const demoRequest = demoArg && demoSep > 0 ? demoArg.slice(demoSep + 1) : null
// 截图模式：--screenshot=<route>:<输出png>（UI 视觉审核用，modlens 审图闭环）
const shotArg = process.argv.find((a) => a.startsWith('--screenshot='))
const shotParts = shotArg ? shotArg.slice('--screenshot='.length).split(':') : null
// `--screenshot=/notes+chat:out.png` — a `+flag` suffix asks the harness-free
// UI states (the agent panel, the source tab) to open before the capture.
const shotSpec = (shotParts?.[0] ?? '').split('+')
const shotRoute = shotSpec[0] ?? ''
const shotFlags = new Set(shotSpec.slice(1))
const shotOut = shotParts?.[1] ?? ''

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
  if (demoPdf) {
    // The recorded walkthrough needs a window at a place the screen recorder
    // can be pointed at without guessing.
    const { workArea } = screen.getPrimaryDisplay()
    const width = Math.min(1400, workArea.width - 40)
    const height = Math.min(880, workArea.height - 40)
    win.setBounds({ x: workArea.x + Math.round((workArea.width - width) / 2), y: workArea.y + 20, width, height })
    win.setAlwaysOnTop(true)
    win.focus()
    // The recorder points itself at exactly this rectangle. Deriving it from the
    // display's Retina resolution instead is how a clip ends up with the Dock in
    // it, so the window reports its own bounds.
    if (process.env['LOOMNOTE_DATA_DIR']) {
      try {
        fs.writeFileSync(path.join(process.env['LOOMNOTE_DATA_DIR'], 'window.json'), JSON.stringify(win.getBounds()))
      } catch {
        /* the recorder falls back to a centred region */
      }
    }
    // A scripted run is unattended, so the renderer's own complaints have to
    // reach the log or a silent failure looks like a slow model.
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error' || event.level === 'warning') console.log(`[renderer:${event.level}] ${event.message}`)
    })
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
  if (shotOut) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          if (shotFlags.has('chat')) {
            await win.webContents.executeJavaScript(`document.querySelector('.side-agent-btn')?.click()`)
            await new Promise((r) => setTimeout(r, 400))
          }
          if (shotFlags.has('rail')) {
            await win.webContents.executeJavaScript(`document.querySelector('.side-collapse')?.click()`)
            await new Promise((r) => setTimeout(r, 600))
          }
          if (shotFlags.has('slides')) {
            await win.webContents.executeJavaScript(
              `[...document.querySelectorAll('.tabs button')].find((b) => /Slides|原稿/.test(b.textContent || ''))?.click()`
            )
            await new Promise((r) => setTimeout(r, 1500))
          }
          if (shotFlags.has('demo') || [...shotFlags].some((f) => f.startsWith('step'))) {
            // Card review: open the demo, optionally press one of its controls,
            // then let the frame repaint before the capture. A demo gets a small
            // space, and a clipped control is a real defect — so it is inspected
            // at the size a reader actually gets.
            await win.webContents.executeJavaScript(
              `[...document.querySelectorAll('.tabs button')].find((b) => /Demo|演示/.test(b.textContent || ''))?.click()`
            )
            await new Promise((r) => setTimeout(r, 2200))
            const step = [...shotFlags].find((f) => f.startsWith('step'))
            const index = step ? Number(step.slice(4)) : -1
            if (index >= 0) {
              await win.webContents.executeJavaScript(
                `(() => { const f = document.querySelector('.demo-pane iframe, .demo-card iframe'); if (f) f.contentWindow.postMessage({ __loomnote: 'click', index: ${index} }, '*'); return true })()`
              )
              await new Promise((r) => setTimeout(r, 1400))
            }
          }
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
      }, 2400)
    })
  }
  return win
}

/**
 * Drive the recorded walkthrough: import a real lecture, let the note appear,
 * open the agent panel and submit the request. See {@link demoArg}.
 */
function runScriptedWalkthrough(pdfPath: string, request: string): void {
  const win = mainWindow
  if (!win || !db) return
  win.webContents.once('did-finish-load', async () => {
    try {
      const { parseDocument } = await import('./parse.js')
      const parsed = await parseDocument(pdfPath)
      const { frontMatter, body } = parseFrontMatter(parsed.text)
      const now = Date.now()
      const note = {
        id: newId(),
        title: (frontMatter.title as string | undefined) ?? parsed.title,
        bodyMd: body,
        frontMatter,
        status: 'draft' as const,
        createdAt: now,
        updatedAt: now
      }
      db?.saveNote(note)
      await demoDeps?.workspace.importSource(note.id, pdfPath)
      db?.addImport({ id: newId(), kind: parsed.kind, sourcePath: pdfPath, status: 'done', log: `demo import via ${parsed.kind}`, createdAt: now, finishedAt: now })
      console.log(`[demo] imported ${pdfPath} as note ${note.id} (${body.length} chars)`)

      win.webContents.reload()
      const clickTab = (label: RegExp): Promise<unknown> =>
        win.webContents.executeJavaScript(
          `[...document.querySelectorAll('.tabs button')].find((b) => ${label}.test(b.textContent || ''))?.click()`
        )

      win.webContents.once('did-finish-load', () => {
        // A note that has just been imported opens on its deck; hold there long
        // enough to read a page, then move to the note the agent is about to grow.
        setTimeout(() => {
          void (async () => {
            const click = (selector: string): Promise<unknown> => win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)})?.click()`)
            const hold = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

            // Both rails on the left fold away before anything is typed, and
            // stay that way: the note keeps the width for the rest of the run.
            // Only the agent panel toggles, so its control is shown too.
            await click('.side-collapse')
            await hold(1800)
            await click('.pane-collapse')
            await hold(1800)
            await click('.side-agent-btn')
            await hold(900)
            await click('.agent-head .icon-btn')
            await hold(1600)
            await click('.side-agent-btn')
            await hold(900)

            // The request is typed into the real composer and sent with the
            // real button: a walkthrough has to show the instruction itself,
            // not only its consequences.
            await typeAndSend(win, request)
          })()
        }, 5000)
      })

      demoOnTurnEnd = () => {
        console.log(`[demo] mark turn-complete ${Date.now()}`)
        void runTour(win)
      }
      demoOnFirstWrite = () => {
        demoOnFirstWrite = null
        console.log(`[demo] mark first-write ${Date.now()}`)
        // Only now is the right-hand pane a note rather than our extraction of
        // the deck, so only now is the pair view worth showing.
        void win.webContents.executeJavaScript(
          `[...document.querySelectorAll('.tabs button')].find((b) => /Slides \+ note|原稿 \+ 笔记/.test(b.textContent || ''))?.click()`
        )
      }
    } catch (error) {
      console.error('[demo] failed', error)
    }
  })
}

/** Host references the scripted walkthrough needs; set once the app is ready. */
let demoDeps: { chatHost: ChatHost; workspace: NoteWorkspace } | null = null
/** Set by the walkthrough; runs the note tour once the turn ends. */
let demoOnTurnEnd: (() => void) | null = null
/** Set by the walkthrough; fires the first time the agent writes the note file. */
let demoOnFirstWrite: (() => void) | null = null


/**
 * Type a request into the chat composer and press Send, in the page.
 *
 * Writing it in small chunks rather than assigning the value makes the box
 * behave exactly as it does for a person — the React state updates, the
 * composer grows, and a viewer can read the instruction before it is sent.
 */
async function typeAndSend(win: BrowserWindow, request: string): Promise<void> {
  const chunks = JSON.stringify(request.match(/.{1,6}/gs) ?? [request])
  try {
    await win.webContents.executeJavaScript(`(async () => {
      const box = document.querySelector('.chat-compose textarea')
      if (!box) throw new Error('composer not found')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
      box.focus()
      for (const chunk of ${chunks}) {
        setter.call(box, box.value + chunk)
        box.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 55))
      }
      return box.value.length
    })()`)
    // Let the reader finish the sentence before it goes.
    await new Promise((resolve) => setTimeout(resolve, 2600))
    await win.webContents.executeJavaScript(
      `[...document.querySelectorAll('.chat-compose button')].find((b) => /Send|发送/.test(b.textContent || ''))?.click()`
    )
    console.log(`[demo] prompt accepted: typed-and-sent mark prompt ${Date.now()}`)
  } catch (error) {
    console.error('[demo] send failed', error)
  }
}

/**
 * The second half of the recorded walkthrough: read the finished note from top
 * to bottom, then open its interactive demo and press its controls.
 *
 * Scrolling is animated in the page rather than driven by synthetic wheel
 * events so its pace is the same on every run, and each demo control is pressed
 * through the sandbox bridge — the frame's own element handlers fire, which is
 * what a reader's click does too.
 */
async function runTour(win: BrowserWindow): Promise<void> {
  // Each step is best-effort: a selector that no longer exists must not abort
  // the rest of the walkthrough.
  const run = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script, true).catch(() => undefined)
  const hold = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
  const click = (selector: string): Promise<unknown> => run(`document.querySelector(${JSON.stringify(selector)})?.click()`)
  const tab = (label: string): Promise<unknown> =>
    run(`[...document.querySelectorAll('.tabs button')].find((b) => new RegExp(${JSON.stringify(label)}).test(b.textContent || ''))?.click()`)

  try {
    // 1. The finished note, top to bottom.
    await tab('Read|正文')
    await hold(900)
    await run(`new Promise((done) => {
      const el = document.querySelector('.note-body')
      if (!el) return done(false)
      const total = el.scrollHeight - el.clientHeight
      const start = performance.now()
      const dur = 17000
      const step = (now) => {
        const p = Math.min(1, (now - start) / dur)
        el.scrollTop = total * (p * p * (3 - 2 * p))
        if (p < 1) requestAnimationFrame(step); else done(true)
      }
      requestAnimationFrame(step)
    })`)

    // 2. The deck beside the note written from it — and the point of the pair
    //    view: walk the deck to the rotation slides, bring the note's own
    //    rotation section (with the demo it embeds) next to them, and hold. The
    //    reader can check the animation against the lecture it came from.
    await tab('Slides\\+note|原稿\\+笔记')
    await hold(2000)
    for (let page = 0; page < 11; page += 1) {
      await run(`document.querySelectorAll('.split-left .slide-toolbar .btn')[1]?.click()`)
      await hold(200)
    }
    await hold(1200)
    await run(`document.querySelector('.split-right [data-demo-idx]')?.scrollIntoView({ block: 'center' })`)
    await hold(9000)

    // 3. The interactive demo, driven through the sandbox bridge.
    await tab('Demo|演示')
    await hold(2400)
    const hasFrame = (await run(`document.querySelector('.demo-pane iframe, .demo-card iframe') ? 'yes' : 'no'`)) as string
    if (hasFrame !== 'yes') {
      console.log('[demo] no demo frame to tour')
    } else {
      await run(`(() => { const f = document.querySelector('.demo-pane iframe, .demo-card iframe'); f.contentWindow.postMessage({ __loomnote: 'probe' }, '*'); return true })()`)
      await hold(1400)
      for (let index = 0; index < 4; index += 1) {
        await run(
          `(() => { const f = document.querySelector('.demo-pane iframe, .demo-card iframe'); f.contentWindow.postMessage({ __loomnote: 'click', index: ${index} }, '*'); return true })()`
        )
        await hold(index === 0 ? 2400 : 2000)
      }
    }
    // 4. Back to the pair view with the agent panel folded away as well, so the
    //    deck and the note have the whole window — the state a reader works in.
    //    The left rails were already folded before the request was typed.
    await tab('Slides\\+note|原稿\\+笔记')
    await hold(1200)
    await click('.agent-head .icon-btn')
    await hold(5200)

    console.log(`[demo] mark tour-done ${Date.now()}`)
  } catch (error) {
    console.error('[demo] tour failed', error)
    console.log(`[demo] mark tour-done ${Date.now()}`)
  }
}

/** 截图模式：空库时种子一篇富排版示例笔记，保证截到真实内容。 */
function seedDemoNoteForScreenshot(): void {
  if (!shotOut || !db) return
  if (db.listNotes().length > 0) return
  const en = settingsStore.lang === 'en'
  const demoPath = path.join(__dirname, `../../data/demo-note${en ? '.en' : ''}.md`)
  if (!fs.existsSync(demoPath)) return
  const text = fs.readFileSync(demoPath, 'utf-8')
  const { frontMatter, body } = parseFrontMatter(text)
  const now = Date.now()
  db.saveNote({
    id: newId(),
    title: (frontMatter.title as string | undefined) ?? (en ? 'Demo · 0-1 Knapsack' : '示例 · 0-1 背包问题'),
    bodyMd: body,
    frontMatter,
    status: 'draft',
    createdAt: now,
    updatedAt: now
  })
}

// Must run before the app is ready: a scheme that is not privileged up front is
// opaque to fetch, and the note's own images would never load.
registerWorkspaceScheme()

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
        // The screen recorder watches for these lines: one ends the timed part
        // of the clip, the other keeps the app alive long enough to record.
        if (demoPdf && payload.event.type === 'turn-end') {
          console.log(`[demo] complete (${payload.event.reason})`)
          demoOnTurnEnd?.()
        }
        if (demoPdf && payload.event.type === 'note-changed') demoOnFirstWrite?.()
      },
      onNoteBody: (noteId, bodyMd) => mainWindow?.webContents.send(IPC.noteLive, { noteId, bodyMd })
    })
    chatHostRef = chatHost
    demoDeps = { chatHost, workspace }

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

    seedDemoNoteForScreenshot()
    mainWindow = createWindow(shotRoute || (demoPdf ? '/notes' : undefined))
    if (demoPdf && demoRequest) runScriptedWalkthrough(demoPdf, demoRequest)

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