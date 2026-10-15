import { ipcMain, type BrowserWindow } from 'electron'
import { readFile } from 'node:fs/promises'
import { parseFrontMatter } from '@loomnote/core'
import type { MemoryEngine } from '@loomnote/memory'
import type { ImportRecord, Note } from '@loomnote/core'
import { DEFAULT_SETTINGS, IPC, isSettings, type Settings } from '../shared/ipc.js'
import { newId, type AppDb } from './db.js'
import type { ChatHost } from './harness-host.js'
import type { NoteWorkspace } from './workspace.js'
import { parseDocument } from './parse.js'

export interface IpcContext {
  db: AppDb
  memory: MemoryEngine
  chatHost: ChatHost
  workspace: NoteWorkspace
  getWindow: () => BrowserWindow | null
  getSettings: () => Settings
  setSettings: (s: Settings) => void
}

export function registerIpc(ctx: IpcContext): void {
  const { db, memory, chatHost, workspace, getWindow, getSettings, setSettings } = ctx

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
    // Keep the original next to the note: the reader gets the real deck, and
    // the agent gets page images it can look at.
    await workspace.importSource(note.id, filePath)
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

  // 同步返回界面语言：渲染层首帧即用正确语言
  ipcMain.on(IPC.lang, (e) => {
    e.returnValue = getSettings().lang === 'zh' ? 'zh' : 'en'
  })

  ipcMain.handle(IPC.getSettings, () => getSettings())

  ipcMain.handle(IPC.setSettings, (_e, s: Settings) => {
    if (!isSettings(s)) throw new Error('bad settings')
    const next: Settings = { providers: s.providers, activeProviderId: s.activeProviderId, webEnabled: s.webEnabled, lang: s.lang === 'zh' ? 'zh' : 'en' }
    setSettings(next)
    return next
  })

  ipcMain.handle(IPC.chatSend, async (_e, noteId: unknown, text: unknown) => {
    if (typeof noteId !== 'string' || !noteId) throw new Error('chatSend: a note id is required')
    if (typeof text !== 'string' || !text.trim()) throw new Error('chatSend: empty request')
    return chatHost.send(noteId, text)
  })

  ipcMain.handle(IPC.chatStop, async (_e, noteId: unknown) => {
    if (typeof noteId !== 'string' || !noteId) throw new Error('chatStop: a note id is required')
    await chatHost.stop(noteId)
  })

  ipcMain.handle(IPC.chatStatus, () => chatHost.statuses())

  ipcMain.handle(IPC.noteSource, async (_e, noteId: unknown) => {
    if (typeof noteId !== 'string' || !noteId) throw new Error('noteSource: a note id is required')
    return workspace.describeSource(noteId)
  })

  ipcMain.handle(IPC.noteReadAsset, async (_e, noteId: unknown, relPath: unknown) => {
    if (typeof noteId !== 'string' || !noteId) throw new Error('noteReadAsset: a note id is required')
    if (typeof relPath !== 'string' || !relPath) throw new Error('noteReadAsset: a path is required')
    const resolved = workspace.resolveAsset(noteId, relPath)
    if (!resolved) throw new Error(`noteReadAsset: ${relPath} is outside the note folder`)
    return readFile(resolved)
  })

  ipcMain.handle(IPC.noteWriteAsset, async (_e, noteId: unknown, relPath: unknown, base64: unknown) => {
    if (typeof noteId !== 'string' || !noteId) throw new Error('noteWriteAsset: a note id is required')
    if (typeof relPath !== 'string' || !relPath) throw new Error('noteWriteAsset: a path is required')
    if (typeof base64 !== 'string') throw new Error('noteWriteAsset: bytes are required')
    await workspace.writeAsset(noteId, relPath, base64)
  })

  ipcMain.handle(IPC.noteWrite, async (_e, noteId: unknown, bodyMd: unknown) => {
    if (typeof noteId !== 'string' || !noteId) throw new Error('noteWrite: a note id is required')
    if (typeof bodyMd !== 'string') throw new Error('noteWrite: a body is required')
    const note = db.getNote(noteId)
    if (!note) throw new Error(`noteWrite: no note with id ${noteId}`)
    db.saveNote({ ...note, bodyMd, updatedAt: Date.now() })
    // The agent reads the file, so the file has to move with the row.
    await workspace.write(noteId, bodyMd)
    getWindow()?.webContents.send(IPC.noteLive, { noteId, bodyMd })
  })
}