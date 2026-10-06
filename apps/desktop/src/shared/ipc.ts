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
  agentEvent: 'agent:event',
  lang: 'app:lang'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

export interface ProviderConfig {
  id: string
  name: string
  baseURL: string
  apiKey: string
  model: string
  maxTokens: number
}

export interface Settings {
  /** 接口列表（可增删改），首项为 DeepSeek 官方 API 预设 */
  providers: ProviderConfig[]
  activeProviderId: string
  webEnabled: boolean
  /** 界面语言；同时决定 AI 生成笔记的书写语言 */
  lang: Lang
}

export type Lang = 'zh' | 'en'

export function newProviderId(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'custom'
  return `${slug}-${Math.random().toString(36).slice(2, 7)}`
}

export function getActiveProvider(s: Settings): ProviderConfig {
  return s.providers.find((p) => p.id === s.activeProviderId) ?? s.providers[0] ?? PRESET_PROVIDERS[0]!
}

/** 内置预设：当前只保留 DeepSeek 官方 API（其余接口按需自行添加） */
export const PRESET_PROVIDERS: ProviderConfig[] = [
  {
    id: 'deepseek-official',
    name: 'DeepSeek 官方 API',
    baseURL: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-v4.1-flash',
    maxTokens: 1000000
  }
]

export const DEFAULT_SETTINGS: Settings = {
  providers: PRESET_PROVIDERS.map((p) => ({ ...p })),
  activeProviderId: 'deepseek-official',
  webEnabled: true,
  lang: 'en'
}

/** 旧版单接口设置迁移为新版多接口结构 */
export function migrateSettings(raw: unknown): Settings {
  if (isSettings(raw)) return raw
  const o = (raw ?? {}) as Record<string, unknown>
  const baseURL = typeof o.baseURL === 'string' && o.baseURL ? o.baseURL : ''
  const isDeepSeek = baseURL.toLowerCase().includes('deepseek')
  const provider: ProviderConfig = {
    ...PRESET_PROVIDERS[0]!,
    ...(isDeepSeek
      ? {
          baseURL,
          apiKey: typeof o.apiKey === 'string' ? o.apiKey : '',
          model: typeof o.model === 'string' && o.model ? o.model : PRESET_PROVIDERS[0]!.model,
          maxTokens: typeof o.maxTokens === 'number' ? o.maxTokens : PRESET_PROVIDERS[0]!.maxTokens
        }
      : {})
  }
  return {
    providers: [provider],
    activeProviderId: provider.id,
    webEnabled: o.webEnabled !== false,
    lang: o.lang === 'zh' || o.lang === 'en' ? (o.lang as Lang) : 'en'
  }
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
  /** 启动即读：首帧就按正确语言渲染（同步，无闪烁） */
  defaultLang: Lang
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
    typeof s === 'object' &&
    s !== null &&
    Array.isArray(s.providers) &&
    s.providers.length > 0 &&
    s.providers.every(
      (p) =>
        typeof p === 'object' && p !== null && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.baseURL === 'string' && typeof p.apiKey === 'string' && typeof p.model === 'string' && typeof p.maxTokens === 'number'
    ) &&
    typeof s.activeProviderId === 'string' &&
    typeof s.webEnabled === 'boolean'
  )
}