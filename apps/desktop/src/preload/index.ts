import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC, type AgentEvent, type LoomnoteApi } from '../shared/ipc.js'

const api: LoomnoteApi = {
  health: () => ipcRenderer.invoke(IPC.health),
  listImports: () => ipcRenderer.invoke(IPC.listImports),
  pickImport: () => ipcRenderer.invoke(IPC.pickImport),
  addImportMd: (path: string) => ipcRenderer.invoke(IPC.addImportMd, path),
  listNotes: () => ipcRenderer.invoke(IPC.listNotes),
  getNote: (id: string) => ipcRenderer.invoke(IPC.getNote, id),
  saveNote: (note) => ipcRenderer.invoke(IPC.saveNote, note),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  setSettings: (s) => ipcRenderer.invoke(IPC.setSettings, s),
  runAgent: (task: string) => ipcRenderer.invoke(IPC.runAgent, task),
  cancelAgent: () => ipcRenderer.invoke(IPC.agentCancel),
  getPathForFile: async (file: File) => webUtils.getPathForFile(file),
  onAgentEvent: (cb: (e: AgentEvent) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, evt: AgentEvent): void => cb(evt)
    ipcRenderer.on(IPC.agentEvent, listener)
    return () => ipcRenderer.removeListener(IPC.agentEvent, listener)
  }
}

contextBridge.exposeInMainWorld('loomnote', api)