import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { ImportRecord, Note } from '@loomnote/core'

const require = createRequire(__filename)
type SqliteCtor = typeof import('better-sqlite3')
let SQLite: SqliteCtor | null = null
try {
  SQLite = require('better-sqlite3') as SqliteCtor
} catch {
  SQLite = null
}

export interface AppDb {
  kind: 'sqlite' | 'json'
  health(): { ok: boolean; db: 'sqlite' | 'json'; noteCount: number; importCount: number }
  listNotes(): Array<{ id: string; title: string; updatedAt: number }>
  getNote(id: string): Note | undefined
  saveNote(note: Note): void
  listImports(): Array<{ id: string; kind: ImportRecord['kind']; sourcePath: string; status: ImportRecord['status']; createdAt: number }>
  addImport(rec: ImportRecord): void
  getSetting(key: string): string | undefined
  setSetting(key: string, value: string): void
  close(): void
}

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, body_md TEXT NOT NULL,
    front_matter TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'draft',
    import_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS imports (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, source_path TEXT NOT NULL,
    status TEXT NOT NULL, log TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL,
    finished_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS resources (
    id TEXT PRIMARY KEY, import_id TEXT, kind TEXT, rel_path TEXT, meta TEXT, checksum TEXT, created_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`
]

export function openDatabase(userDataDir: string): AppDb {
  const file = path.join(userDataDir, 'loomnote.db')
  if (!SQLite) return new JsonAppDb(file)
  try {
    return new SqliteAppDb(SQLite, file)
  } catch (e) {
    console.error('[db] sqlite open failed, falling back to json', e)
    return new JsonAppDb(file)
  }
}

class SqliteAppDb implements AppDb {
  readonly kind = 'sqlite' as const
  private db: InstanceType<SqliteCtor>

  constructor(Ctor: SqliteCtor, file: string) {
    this.db = new Ctor(file)
    // 五条 PRAGMA（03 §7 / 06 B5）
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('busy_timeout = 5000')
    this.db.pragma('wal_autocheckpoint = 1000')
    this.db.pragma('journal_size_limit = 67108864')
    this.migrate()
    // 冷启动健康断言（05 M1：异常退出后库自动校验恢复）
    try {
      const row = this.db.prepare('PRAGMA quick_check').get() as { quick_check: string }
      if (row && row.quick_check !== 'ok') throw new Error(`quick_check=${row.quick_check}`)
    } catch (e) {
      console.error('[db] integrity check failed, quarantining', e)
      const quarantine = `${file}.quarantine-${Date.now()}`
      try {
        this.db.close()
        fs.renameSync(file, quarantine)
        this.db = new Ctor(file)
        this.db.pragma('journal_mode = WAL')
        this.migrate()
      } catch {
        // 隔离失败则保持内存语义
      }
    }
  }

  private migrate(): void {
    this.db.exec('BEGIN')
    try {
      for (const sql of MIGRATIONS) this.db.exec(sql)
      this.db.exec('COMMIT')
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }

  health(): { ok: boolean; db: 'sqlite' | 'json'; noteCount: number; importCount: number } {
    let noteCount = 0
    let importCount = 0
    try {
      noteCount = (this.db.prepare('SELECT COUNT(*) c FROM notes').get() as { c: number }).c
      importCount = (this.db.prepare('SELECT COUNT(*) c FROM imports').get() as { c: number }).c
    } catch {
      /* noop */
    }
    return { ok: true, db: 'sqlite', noteCount, importCount }
  }

  listNotes(): Array<{ id: string; title: string; updatedAt: number }> {
    return this.db.prepare('SELECT id, title, updated_at as updatedAt FROM notes ORDER BY updated_at DESC').all() as unknown as Array<{ id: string; title: string; updatedAt: number }>
  }

  getNote(id: string): Note | undefined {
    const row = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as (Record<string, unknown> & { id: string; title: string; body_md: string; front_matter: string; status: string; import_id?: string | null; created_at: number; updated_at: number }) | undefined
    if (!row) return undefined
    return {
      id: row.id,
      title: row.title,
      bodyMd: row.body_md,
      frontMatter: JSON.parse(row.front_matter || '{}'),
      status: row.status as Note['status'],
      importId: row.import_id ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  saveNote(note: Note): void {
    this.db
      .prepare(
        `INSERT INTO notes (id,title,body_md,front_matter,status,import_id,created_at,updated_at)
         VALUES (@id,@title,@body,@fm,@status,@importId,@created,@updated)
         ON CONFLICT(id) DO UPDATE SET title=@title,body_md=@body,front_matter=@fm,status=@status,updated_at=@updated`
      )
      .run({
        id: note.id,
        title: note.title,
        body: note.bodyMd,
        fm: JSON.stringify(note.frontMatter),
        status: note.status,
        importId: note.importId ?? null,
        created: note.createdAt,
        updated: note.updatedAt
      })
  }

  listImports(): Array<{ id: string; kind: ImportRecord['kind']; sourcePath: string; status: ImportRecord['status']; createdAt: number }> {
    return this.db.prepare('SELECT id, kind, source_path as sourcePath, status, created_at as createdAt FROM imports ORDER BY created_at DESC').all() as unknown as Array<{ id: string; kind: ImportRecord['kind']; sourcePath: string; status: ImportRecord['status']; createdAt: number }>
  }

  addImport(rec: ImportRecord): void {
    this.db
      .prepare('INSERT INTO imports (id,kind,source_path,status,log,created_at,finished_at) VALUES (?,?,?,?,?,?,?)')
      .run(rec.id, rec.kind, rec.sourcePath, rec.status, rec.log, rec.createdAt, rec.finishedAt ?? null)
  }

  getSetting(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value
  }

  setSetting(key: string, value: string): void {
    this.db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value)
  }

  close(): void {
    try {
      this.db.pragma('wal_checkpoint(TRUNCATE)')
      this.db.close()
    } catch {
      /* noop */
    }
  }
}

/** 无原生模块时的 JSON 兜底（断网/无编译工具链可跑 dev）。 */
class JsonAppDb implements AppDb {
  readonly kind = 'json' as const
  private file: string
  private notes = new Map<string, Note>()
  private imports: ImportRecord[] = []
  private settings = new Map<string, string>()
  private saved = false

  constructor(file: string) {
    this.file = file.replace(/\.db$/, '.json')
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as { notes: Note[]; imports: ImportRecord[]; settings: Array<[string, string]> }
      for (const n of data.notes ?? []) this.notes.set(n.id, n)
      this.imports = data.imports ?? []
      this.settings = new Map(data.settings ?? [])
      this.saved = true
    } catch {
      /* fresh */
    }
  }

  private persist(): void {
    this.saved = true
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      fs.writeFileSync(this.file, JSON.stringify({ notes: [...this.notes.values()], imports: this.imports, settings: [...this.settings.entries()] }))
    } catch {
      /* noop */
    }
  }

  health(): { ok: boolean; db: 'sqlite' | 'json'; noteCount: number; importCount: number } {
    return { ok: true, db: 'json', noteCount: this.notes.size, importCount: this.imports.length }
  }
  listNotes(): Array<{ id: string; title: string; updatedAt: number }> {
    return [...this.notes.values()].sort((a, b) => b.updatedAt - a.updatedAt).map((n) => ({ id: n.id, title: n.title, updatedAt: n.updatedAt }))
  }
  getNote(id: string): Note | undefined {
    return this.notes.get(id)
  }
  saveNote(note: Note): void {
    this.notes.set(note.id, note)
    this.persist()
  }
  listImports(): Array<{ id: string; kind: ImportRecord['kind']; sourcePath: string; status: ImportRecord['status']; createdAt: number }> {
    return this.imports.map((r) => ({ id: r.id, kind: r.kind, sourcePath: r.sourcePath, status: r.status, createdAt: r.createdAt }))
  }
  addImport(rec: ImportRecord): void {
    this.imports.unshift(rec)
    this.persist()
  }
  getSetting(key: string): string | undefined {
    return this.settings.get(key)
  }
  setSetting(key: string, value: string): void {
    this.settings.set(key, value)
    this.persist()
  }
  close(): void {
    this.persist()
  }
}

export function newId(): string {
  return randomUUID()
}