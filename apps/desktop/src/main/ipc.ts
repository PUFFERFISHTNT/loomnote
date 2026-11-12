import { ipcMain, type BrowserWindow } from 'electron'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseFrontMatter } from '@loomnote/core'
import type { MemoryEngine } from '@loomnote/memory'
import type { ImportRecord, Note, ReviewRating } from '@loomnote/core'
import { DEFAULT_SETTINGS, IPC, isSettings, type Settings } from '../shared/ipc.js'
import { newId, type AppDb } from './db.js'
import type { ChatHost } from './harness-host.js'
import type { NoteWorkspace } from './workspace.js'
import { parseDocument, SUPPORTED_EXTENSIONS } from './parse.js'
import { createStudyService } from './study.js'
import { createMergeService } from './merge.js'
import { testProvider } from './provider.js'
import { appendPreference, rememberedPreference } from './preferences.js'
import { createCourseService } from './courses.js'
import sampleEnglish from '../../data/demo-note.en.md?raw'
import sampleChinese from '../../data/demo-note.md?raw'

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
  const study = createStudyService(db)
  const courses = createCourseService(db)
  const merges = createMergeService(db, workspace)
  const idleNote = (noteId: unknown): string => {
    if (typeof noteId !== 'string' || !db.getNote(noteId)) throw new Error('An existing note is required.')
    if (['running', 'starting'].includes(chatHost.statusFor(noteId))) throw new Error('Stop the agent before changing this note.')
    return noteId
  }

  ipcMain.handle(IPC.health, () => db.health())
  ipcMain.handle(IPC.listCourses, () => courses.list())
  ipcMain.handle(IPC.createCourse, (_e, name: string) => courses.create(name))
  ipcMain.handle(IPC.updateCourse, (_e, id: string, name: string, archived: boolean) => {
    const course = courses.list().find((c) => c.id === id)
    for (const note of db.listNotes().filter((n) => n.course === course?.name)) idleNote(note.id)
    return courses.update(id, name, archived)
  })
  ipcMain.handle(IPC.openSample, async () => {
    const lang = getSettings().lang
    const id = `sample-${lang}`
    const existing = db.getNote(id)
    if (existing) return existing
    const { frontMatter, body } = parseFrontMatter(lang === 'zh' ? sampleChinese : sampleEnglish)
    const now = Date.now()
    const note: Note = { id, title: typeof frontMatter.title === 'string' ? frontMatter.title : 'LoomNote sample', bodyMd: body, frontMatter, status: 'organized', createdAt: now, updatedAt: now }
    await workspace.ensure(id, body)
    db.saveNote(note)
    return note
  })

  ipcMain.handle(IPC.listImports, () => db.listImports())

  ipcMain.handle(IPC.pickImport, async () => {
    const { dialog } = await import('electron')
    const win = getWindow()
    const res = win ? await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Course material', extensions: SUPPORTED_EXTENSIONS }] }) : { canceled: true, filePaths: [] }
    return res.canceled || !res.filePaths[0] ? null : res.filePaths[0]
  })

  ipcMain.handle(IPC.addImportMd, async (_e, filePath: string, course?: string) => {
    if (typeof filePath !== 'string' || !filePath) throw new Error('bad path')
    const parsed = await parseDocument(filePath)
    const { frontMatter, body } = parseFrontMatter(parsed.text)
    if (course !== undefined && (typeof course !== 'string' || course.length > 120)) throw new Error('Course names must be at most 120 characters.')
    frontMatter.course = course?.trim() || (typeof frontMatter.course === 'string' ? frontMatter.course : path.basename(path.dirname(filePath)))
    const now = Date.now()
    const importId = newId()
    const note: Note = {
      id: newId(),
      title: (frontMatter.title as string | undefined) ?? parsed.title,
      bodyMd: body,
      frontMatter,
      status: 'draft',
      importId,
      createdAt: now,
      updatedAt: now
    }
    // Keep the original next to the note: the reader gets the real deck, and
    // the agent gets page images it can look at.
    try {
      await workspace.importSource(note.id, filePath, parsed.text)
      await workspace.ensure(note.id, body)
      db.saveNote(note)
    } catch (error) {
      await workspace.remove(note.id)
      throw error
    }
    memory.ingestDocument(`file://${filePath}`, parsed.text)
    const rec: ImportRecord = { id: importId, kind: parsed.kind, sourcePath: filePath, status: 'done', log: `imported via ${parsed.kind}`, createdAt: now, finishedAt: now }
    db.addImport(rec)
    return rec
  })

  ipcMain.handle(IPC.listNotes, () => db.listNotes())
  ipcMain.handle(IPC.pickImports, async () => {
    const { dialog } = await import('electron')
    const win = getWindow()
    if (!win) return []
    const result = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Course material', extensions: SUPPORTED_EXTENSIONS }] })
    return result.canceled ? [] : result.filePaths
  })

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
    const next: Settings = { providers: s.providers, activeProviderId: s.activeProviderId, webEnabled: s.webEnabled, lang: s.lang === 'zh' ? 'zh' : 'en', studyPreferences: s.studyPreferences ?? '' }
    setSettings(next)
    return next
  })

  ipcMain.handle(IPC.testProvider, (_e, provider) => testProvider(provider))
  ipcMain.handle(IPC.reviewList, () => study.cards())
  ipcMain.handle(IPC.reviewRate, (_e, id: string, rating: ReviewRating) => study.rate(id, rating))
  ipcMain.handle(IPC.noteGraph, () => study.graph())
  ipcMain.handle(IPC.setNoteCourse, (_e, noteId: string, course: string) => {
    idleNote(noteId)
    if (typeof course !== 'string' || course.length > 120) throw new Error('Course names must be at most 120 characters.')
    const note = db.getNote(noteId)!
    const updated = { ...note, frontMatter: { ...note.frontMatter, course: course.trim() }, updatedAt: Date.now() }
    db.saveNote(updated)
    return updated
  })
  ipcMain.handle(IPC.noteSources, (_e, noteId: string) => {
    if (!db.getNote(noteId)) throw new Error('An existing note is required.')
    return workspace.listSources(noteId)
  })
  ipcMain.handle(IPC.mergePrepare, (_e, noteId: string, filePath: string) => {
    idleNote(noteId)
    if (typeof filePath !== 'string' || !filePath) throw new Error('Choose a lecture file.')
    return merges.prepare(noteId, filePath)
  })
  ipcMain.handle(IPC.mergeApply, async (_e, noteId: string, proposalId: string, selected: string[]) => {
    idleNote(noteId)
    if (typeof proposalId !== 'string' || !Array.isArray(selected) || !selected.every((id) => typeof id === 'string')) throw new Error('Invalid merge selection.')
    const note = await merges.apply(noteId, proposalId, selected)
    getWindow()?.webContents.send(IPC.noteLive, { noteId, bodyMd: note.bodyMd })
    return note
  })

  ipcMain.handle(IPC.chatSend, async (_e, noteId: unknown, text: unknown) => {
    if (typeof noteId !== 'string' || !noteId) throw new Error('chatSend: a note id is required')
    if (typeof text !== 'string' || !text.trim()) throw new Error('chatSend: empty request')
    if (!db.getNote(noteId)) throw new Error('Open an existing note first.')
    const preference = rememberedPreference(text)
    if (preference) {
      const settings = getSettings()
      setSettings({ ...settings, studyPreferences: appendPreference(settings.studyPreferences ?? '', preference) })
    }
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
    idleNote(noteId)
    // The agent reads the file, so the file has to move with the row.
    await workspace.write(noteId, bodyMd)
    db.saveNote({ ...note, bodyMd, updatedAt: Date.now() })
    getWindow()?.webContents.send(IPC.noteLive, { noteId, bodyMd })
  })
}
