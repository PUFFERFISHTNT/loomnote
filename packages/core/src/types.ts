export type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

export type RelationKind = 'predecessor' | 'extension' | 'analogy' | 'application' | 'source'

export interface FrontMatter {
  title?: string
  tags?: string[]
  difficulty?: number
  links?: string[]
  source?: string
  [key: string]: Json | undefined
}

export interface Note {
  id: string
  title: string
  bodyMd: string
  frontMatter: FrontMatter
  status: 'draft' | 'organized'
  importId?: string
  createdAt: number
  updatedAt: number
}

export interface ImportRecord {
  id: string
  kind: 'md' | 'pdf' | 'image' | 'html' | 'url' | 'word' | 'excel'
  sourcePath: string
  status: 'pending' | 'parsing' | 'done' | 'failed'
  log: string
  createdAt: number
  finishedAt?: number
}

export interface KnowledgeNode {
  id: string
  noteId: string
  title: string
  summary: string
  tags: string[]
  mastered: number
  strength: number
  lastReviewedAt?: number
}

export interface KnowledgeEdge {
  id: string
  fromId: string
  toId: string
  relation: RelationKind
  weight: number
}

export type AgentEvent =
  | { type: 'plan'; plan: string }
  | { type: 'delta'; text: string }
  | { type: 'tool-start'; id: string; tool: string; args: Json }
  | { type: 'tool-result'; id: string; tool: string; ok: boolean; output: string }
  | { type: 'done'; output: string }
  | { type: 'error'; message: string }
  | { type: 'checkpoint'; step: number }