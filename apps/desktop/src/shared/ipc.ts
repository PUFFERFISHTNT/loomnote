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
}

export function newProviderId(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'custom'
  return `${slug}-${Math.random().toString(36).slice(2, 7)}`
}

export function getActiveProvider(s: Settings): ProviderConfig {
  return s.providers.find((p) => p.id === s.activeProviderId) ?? s.providers[0] ?? PRESET_PROVIDERS[0]!
}

/** 内置预设：DeepSeek 官方 API 排第一 */
export const PRESET_PROVIDERS: ProviderConfig[] = [
  {
    id: 'deepseek-official',
    name: 'DeepSeek 官方 API',
    baseURL: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat',
    maxTokens: 8192
  },
  {
    id: 'volc-ark-coding',
    name: '火山方舟 Coding Plan',
    baseURL: 'https://ark.cn-beijing.volces.com/api/coding/v3',
    apiKey: '',
    model: 'deepseek-v4-flash',
    maxTokens: 4096
  },
  {
    id: 'volc-ark-glm',
    name: '火山方舟 · GLM 5.3 Flash（视觉）',
    baseURL: 'https://ark.cn-beijing.volces.com/api/coding/v3',
    apiKey: '',
    model: 'glm-5.3-flash',
    maxTokens: 8192
  },
  {
    id: 'ollama-local',
    name: '本地 Ollama',
    baseURL: 'http://localhost:11434/v1',
    apiKey: 'ollama',
    model: 'qwen3:8b',
    maxTokens: 8192
  }
]

export const DEFAULT_SETTINGS: Settings = {
  providers: PRESET_PROVIDERS.map((p) => ({ ...p })),
  activeProviderId: 'volc-ark-coding',
  webEnabled: true
}

/** 旧版单接口设置迁移为新版多接口结构 */
export function migrateSettings(raw: unknown): Settings {
  if (isSettings(raw)) return raw
  const o = (raw ?? {}) as Record<string, unknown>
  const legacy = {
    baseURL: typeof o.baseURL === 'string' && o.baseURL ? o.baseURL : 'https://ark.cn-beijing.volces.com/api/coding/v3',
    apiKey: typeof o.apiKey === 'string' ? o.apiKey : '',
    model: typeof o.model === 'string' && o.model ? o.model : 'deepseek-v4-flash',
    maxTokens: typeof o.maxTokens === 'number' ? o.maxTokens : 4096,
    webEnabled: o.webEnabled !== false
  }
  return {
    providers: [
      { id: 'volc-ark-coding', name: '火山方舟 Coding Plan', baseURL: legacy.baseURL, apiKey: legacy.apiKey, model: legacy.model, maxTokens: legacy.maxTokens },
      ...PRESET_PROVIDERS.filter((p) => p.id !== 'volc-ark-coding').map((p) => ({ ...p }))
    ],
    activeProviderId: 'volc-ark-coding',
    webEnabled: legacy.webEnabled
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