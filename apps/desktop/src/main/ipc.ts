import { ipcMain, type BrowserWindow } from 'electron'
import { parseFrontMatter } from '@loomnote/core'
import type { MemoryEngine } from '@loomnote/memory'
import type { ImportRecord, Note } from '@loomnote/core'
import { DEFAULT_SETTINGS, IPC, isSettings, type Settings } from '../shared/ipc.js'
import { newId, type AppDb } from './db.js'
import type { AgentHost } from './agent-host.js'
import { parseDocument } from './parse.js'

export interface IpcContext {
  db: AppDb
  memory: MemoryEngine
  agentHost: AgentHost
  getWindow: () => BrowserWindow | null
  getSettings: () => Settings
  setSettings: (s: Settings) => void
}

export function registerIpc(ctx: IpcContext): void {
  const { db, memory, agentHost, getWindow, getSettings, setSettings } = ctx

  ipcMain.handle(IPC.health, () => db.health())

  ipcMain.handle(IPC.listImports, () => db.listImports())

  ipcMain.handle(IPC.pickImport, async () => {
    const { dialog } = await import('electron')
    const win = getWindow()
    const res = win ? await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: '文档', extensions: ['md', 'markdown', 'txt', 'pdf', 'png', 'jpg'] }] }) : { canceled: true, filePaths: [] }
    return res.canceled || !res.filePaths[0] ? null : res.filePaths[0]
  })

  ipcMain.handle(IPC.addImportMd, async (_e, filePath: string) => {
    if (typeof filePath !== 'string' || !filePath) throw new Error('bad path')
    const parsed = await parseDocument(filePath)
    const { frontMatter, body } = parseFrontMatter(parsed.text)
    const now = Date.now()
    const note: Note = {
      id: newId(),
      title: (frontMatter.title as string | undefined) ?? parsed.title,
      bodyMd: body,
      frontMatter,
      status: 'draft',
      createdAt: now,
      updatedAt: now
    }
    db.saveNote(note)
    memory.ingestDocument(`file://${filePath}`, parsed.text)
    const rec: ImportRecord = { id: newId(), kind: parsed.kind, sourcePath: filePath, status: 'done', log: `imported via ${parsed.kind}`, createdAt: now, finishedAt: now }
    db.addImport(rec)
    return rec
  })

  ipcMain.handle(IPC.listNotes, () => db.listNotes())

  ipcMain.handle(IPC.getNote, (_e, id: string) => {
    if (typeof id !== 'string') throw new Error('bad id')
    return db.getNote(id)
  })

  ipcMain.handle(IPC.saveNote, (_e, note: Note) => {
    if (!note || typeof note.id !== 'string') throw new Error('bad note')
    db.saveNote(note)
    // 记忆行为流水：保存即「接受」事件（04 自进化输入）
    memory.recordBehavior({ id: newId(), at: Date.now(), kind: 'accept', target: note.id })
    return note
  })

  ipcMain.handle(IPC.getSettings, () => getSettings())

  ipcMain.handle(IPC.setSettings, (_e, s: Settings) => {
    if (!isSettings(s)) throw new Error('bad settings')
    const next: Settings = { providers: s.providers, activeProviderId: s.activeProviderId, webEnabled: s.webEnabled }
    setSettings(next)
    return next
  })

  ipcMain.handle(IPC.runAgent, async (_e, task: string) => {
    if (typeof task !== 'string' || !task.trim()) throw new Error('empty task')
    const win = getWindow()
    return agentHost.run(task, (evt) => win?.webContents.send(IPC.agentEvent, evt))
  })

  ipcMain.handle(IPC.agentCancel, () => {
    agentHost.cancel()
  })
}