import type { HarnessEvent } from '@loomnote/harness'
import type { ImportRecord, Note, MergeChange, ReviewCard, ReviewRating, NoteGraph } from '@loomnote/core'

export type { HarnessEvent } from '@loomnote/harness'

export const IPC = {
  health: 'app:health',
  listImports: 'import:list',
  pickImport: 'import:pick',
  pickImports: 'import:pickMany',
  addImportMd: 'import:addMd',
  listNotes: 'note:list',
  getNote: 'note:get',
  saveNote: 'note:save',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  testProvider: 'settings:testProvider',
  reviewList: 'review:list',
  reviewRate: 'review:rate',
  noteGraph: 'note:graph',
  mergePrepare: 'note:mergePrepare',
  mergeApply: 'note:mergeApply',
  noteSources: 'note:sources',
  openSample: 'note:openSample',
  setNoteCourse: 'note:setCourse',
  listCourses: 'course:list',
  createCourse: 'course:create',
  updateCourse: 'course:update',
  /** Ask a note's harness session to work on a request. */
  chatSend: 'chat:send',
  /** Stop a note's harness session. */
  chatStop: 'chat:stop',
  /** Current lifecycle state of every live session. */
  chatStatus: 'chat:status',
  /** Renderer-bound push: one harness event, tagged with its note. */
  chatEvent: 'chat:event',
  /** Renderer-bound push: the note file changed on disk. */
  noteLive: 'note:live',
  /** Write a note body to both the database and the agent's working file. */
  noteWrite: 'note:write',
  /** Describe the lecture a note was imported from. */
  noteSource: 'note:source',
  /** Write a note-relative asset (a rendered slide image) from base64 bytes. */
  noteWriteAsset: 'note:writeAsset',
  /** Read a note-relative asset (the imported deck) as bytes. */
  noteReadAsset: 'note:readAsset',
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
  /** Explicit, editable preferences applied to every subsequent request. */
  studyPreferences?: string
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
    model: 'deepseek-flash',
    maxTokens: 1000000
  }
]

export const DEFAULT_SETTINGS: Settings = {
  providers: PRESET_PROVIDERS.map((p) => ({ ...p })),
  activeProviderId: 'deepseek-official',
  webEnabled: false,
  lang: 'en',
  studyPreferences: ''
}

/** 旧版单接口设置迁移为新版多接口结构 */
export function migrateSettings(raw: unknown): Settings {
  if (isSettings(raw)) return { ...raw, lang: raw.lang === 'zh' ? 'zh' : 'en', studyPreferences: raw.studyPreferences ?? '' }
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
    lang: o.lang === 'zh' || o.lang === 'en' ? (o.lang as Lang) : 'en',
    studyPreferences: ''
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
  course?: string
}

export interface Course {
  id: string
  name: string
  archived: boolean
  createdAt: number
}

export interface ImportSummary {
  id: string
  kind: ImportRecord['kind']
  sourcePath: string
  status: ImportRecord['status']
  createdAt: number
}

/** One harness event, tagged with the note whose session produced it. */
export interface ChatEventPayload {
  noteId: string
  event: HarnessEvent
}

/** The note file's new contents after the agent (or the app) wrote it. */
export interface NoteLivePayload {
  noteId: string
  bodyMd: string
}

/** The lecture a note came from, as the renderer needs to show it. */
export interface NoteSourceInfo {
  /** Original file name. */
  name: string
  /** `pdf` decks get a slide view; anything else is offered as a download. */
  kind: 'pdf' | 'image' | 'other'
  /** Page images already rendered into the note folder, 1-based. */
  pages: number[]
  relPath: string
  pagesPath: string
}

export interface MergeProposal {
  id: string
  noteId: string
  sourceName: string
  baseBody: string
  changes: MergeChange[]
}
export interface ProviderTestResult {
  ok: boolean
  message: string
  latencyMs: number
}

/** Lifecycle state of one live session. */
export interface SessionStatus {
  noteId: string
  status: 'starting' | 'ready' | 'running' | 'idle' | 'stopped' | 'error'
}

/** The API `contextBridge` exposes to the renderer. */
export interface LoomnoteApi {
  /** Read synchronously at boot so the first frame is already in the right language. */
  defaultLang: Lang
  health(): Promise<HealthInfo>
  listImports(): Promise<ImportSummary[]>
  pickImport(): Promise<string | null>
  pickImports(): Promise<string[]>
  addImportMd(path: string, course?: string): Promise<ImportRecord>
  listNotes(): Promise<NoteSummary[]>
  getNote(id: string): Promise<Note | undefined>
  saveNote(note: Note): Promise<Note>
  getSettings(): Promise<Settings>
  setSettings(s: Settings): Promise<Settings>
  testProvider(provider: ProviderConfig): Promise<ProviderTestResult>
  reviewList(): Promise<ReviewCard[]>
  reviewRate(id: string, rating: ReviewRating): Promise<ReviewCard>
  noteGraph(): Promise<NoteGraph>
  mergePrepare(noteId: string, filePath: string): Promise<MergeProposal>
  mergeApply(noteId: string, proposalId: string, selected: string[]): Promise<Note>
  noteSources(noteId: string): Promise<NoteSourceInfo[]>
  openSample(): Promise<Note>
  setNoteCourse(noteId: string, course: string): Promise<Note>
  listCourses(): Promise<Course[]>
  createCourse(name: string): Promise<Course>
  updateCourse(id: string, name: string, archived: boolean): Promise<Course>
  /** Send a request to a note's agent session; resolves with the durable receipt. */
  chatSend(noteId: string, text: string): Promise<{ messageId: string }>
  /** Stop a note's agent session. */
  chatStop(noteId: string): Promise<void>
  /**
   * Write a note body. Both copies move together: the durable row the app
   * lists, and the file the agent reads on its next turn.
   */
  noteWrite(noteId: string, bodyMd: string): Promise<void>
  /** Live session states. */
  chatStatus(): Promise<SessionStatus[]>
  /** The lecture this note was imported from, or null when it had none. */
  noteSource(noteId: string): Promise<NoteSourceInfo | null>
  /** Store a note-relative asset; used for the rendered slide images. */
  noteWriteAsset(noteId: string, relPath: string, base64: string): Promise<void>
  /**
   * Read a note-relative asset as bytes.
   *
   * PDF rendering goes through here rather than through the asset scheme: the
   * window's origin is `file://`, and Chromium refuses a cross-origin XHR to a
   * non-standard scheme, so the bytes have to arrive over IPC.
   */
  noteReadAsset(noteId: string, relPath: string): Promise<Uint8Array>
  /** Turn a dropped `File` into its absolute local path (Electron `webUtils`). */
  getPathForFile(file: File): Promise<string>
  /** Subscribe to harness events. */
  onChatEvent(cb: (payload: ChatEventPayload) => void): () => void
  /** Subscribe to note-file changes. */
  onNoteLive(cb: (payload: NoteLivePayload) => void): () => void
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
    typeof s.webEnabled === 'boolean' &&
    (s.studyPreferences === undefined || (typeof s.studyPreferences === 'string' && s.studyPreferences.length <= 8000)) &&
    new Set(s.providers.map((p) => p.id)).size === s.providers.length &&
    s.providers.some((p) => p.id === s.activeProviderId) &&
    s.providers.every((p) => isProviderConfig(p))
  )
}

export function isProviderConfig(v: unknown): v is ProviderConfig {
  const p = v as Partial<ProviderConfig> | null
  if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.id || typeof p.name !== 'string' ||
      typeof p.apiKey !== 'string' || typeof p.model !== 'string' || !p.model.trim() ||
      typeof p.maxTokens !== 'number' || !Number.isSafeInteger(p.maxTokens) || p.maxTokens <= 0 || typeof p.baseURL !== 'string') return false
  try { const url = new URL(p.baseURL); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash } catch { return false }
}
