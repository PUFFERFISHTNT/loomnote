import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC, type ChatEventPayload, type LoomnoteApi, type NoteLivePayload } from '../shared/ipc.js'

/** Subscribe to a main-process push channel and return the unsubscribe function. */
function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: LoomnoteApi = {
  defaultLang: (ipcRenderer.sendSync(IPC.lang) as 'zh' | 'en') ?? 'en',
  health: () => ipcRenderer.invoke(IPC.health),
  listImports: () => ipcRenderer.invoke(IPC.listImports),
  pickImport: () => ipcRenderer.invoke(IPC.pickImport),
  addImportMd: (path: string) => ipcRenderer.invoke(IPC.addImportMd, path),
  listNotes: () => ipcRenderer.invoke(IPC.listNotes),
  getNote: (id: string) => ipcRenderer.invoke(IPC.getNote, id),
  saveNote: (note) => ipcRenderer.invoke(IPC.saveNote, note),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  setSettings: (s) => ipcRenderer.invoke(IPC.setSettings, s),
  chatSend: (noteId: string, text: string) => ipcRenderer.invoke(IPC.chatSend, noteId, text),
  chatStop: (noteId: string) => ipcRenderer.invoke(IPC.chatStop, noteId),
  chatStatus: () => ipcRenderer.invoke(IPC.chatStatus),
  noteWrite: (noteId: string, bodyMd: string) => ipcRenderer.invoke(IPC.noteWrite, noteId, bodyMd),
  noteSource: (noteId: string) => ipcRenderer.invoke(IPC.noteSource, noteId),
  noteWriteAsset: (noteId: string, relPath: string, base64: string) => ipcRenderer.invoke(IPC.noteWriteAsset, noteId, relPath, base64),
  noteReadAsset: (noteId: string, relPath: string) => ipcRenderer.invoke(IPC.noteReadAsset, noteId, relPath),
  getPathForFile: async (file: File) => webUtils.getPathForFile(file),
  onChatEvent: (cb: (payload: ChatEventPayload) => void) => subscribe(IPC.chatEvent, cb),
  onNoteLive: (cb: (payload: NoteLivePayload) => void) => subscribe(IPC.noteLive, cb)
}

contextBridge.exposeInMainWorld('loomnote', api)
