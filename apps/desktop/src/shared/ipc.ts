import type { AgentEvent, ImportRecord, Note } from '@loomnote/core'

export type { AgentEvent } from '@loomnote/core'

export const IPC = {
  health: 'app:health',
  listImports: 'import:list',
  pickImport: 'import:pick',
  addImportMd: 'import:addMd',
  listNotes: 'note:list',
  getNote: 'note:get',
  saveNote: 'note:save',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  runAgent: 'agent:run',
  agentCancel: 'agent:cancel',
  agentEvent: 'agent:event'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

export interface Settings {
  baseURL: string
  apiKey: string
  model: string
  webEnabled: boolean
  maxTokens: number
}

export const DEFAULT_SETTINGS: Settings = {
  baseURL: 'https://ark.cn-beijing.volces.com/api/coding/v3',
  apiKey: '',
  model: 'deepseek-v4-flash',
  webEnabled: true,
  maxTokens: 4096
}

export interface HealthInfo {
  ok: boolean
  db: 'sqlite' | 'json'
  noteCount: number
  importCount: number
}

export interface NoteSummary {
  id: string
  title: string
  updatedAt: number
}

export interface ImportSummary {
  id: string
  kind: ImportRecord['kind']
  sourcePath: string
  status: ImportRecord['status']
  createdAt: number
}

/** preload 暴露给渲染层的 API 契约 */
export interface LoomnoteApi {
  health(): Promise<HealthInfo>
  listImports(): Promise<ImportSummary[]>
  pickImport(): Promise<string | null>
  addImportMd(path: string): Promise<ImportRecord>
  listNotes(): Promise<NoteSummary[]>
  getNote(id: string): Promise<Note | undefined>
  saveNote(note: Note): Promise<Note>
  getSettings(): Promise<Settings>
  setSettings(s: Settings): Promise<Settings>
  runAgent(task: string): Promise<{ output: string; steps: number; toolCalls: number }>
  cancelAgent(): Promise<void>
  /** 拖拽导入：把渲染层 File 对象换成本地绝对路径（Electron webUtils） */
  getPathForFile(file: File): Promise<string>
  onAgentEvent(cb: (e: AgentEvent) => void): () => void
}

export function isSettings(v: unknown): v is Settings {
  const s = v as Partial<Settings>
  return (
    typeof s === 'object' && s !== null && typeof s.baseURL === 'string' && typeof s.apiKey === 'string' && typeof s.model === 'string' && typeof s.webEnabled === 'boolean' && typeof s.maxTokens === 'number'
  )
}