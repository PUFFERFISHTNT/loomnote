import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import type { ImportRecord } from '@loomnote/core'
import { extractOffice } from './office.js'

export type ParsedDocument = { kind: ImportRecord['kind']; title: string; text: string }

const TEXT_EXTS = new Set(['.md', '.markdown', '.txt', '.csv', '.tsv', '.json', '.tex', '.log'])
export const SUPPORTED_EXTENSIONS = ['pdf', 'md', 'markdown', 'txt', 'docx', 'pptx', 'xlsx', 'csv', 'tsv', 'html', 'htm', 'json', 'tex', 'png', 'jpg', 'jpeg', 'webp']

/** 按扩展名分派解析（md/txt 直读；pdf 走 pdfjs 文本提取；其余明确报错，不再静默乱码）。 */
export async function parseDocument(filePath: string): Promise<ParsedDocument> {
  const ext = path.extname(filePath).toLowerCase()
  const stat = fs.statSync(filePath)
  if (!stat.isFile()) throw new Error('Choose a file, rather than a folder.')
  if (stat.size > 50 * 1024 * 1024) throw new Error('This file exceeds the 50 MB import limit. Split or compress it first.')
  if (TEXT_EXTS.has(ext)) {
    const text = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '')
    if (!text.trim()) throw new Error('This file is empty. Add readable text before importing it.')
    if (text.includes('\u0000')) throw new Error('This text encoding is not supported. Save the file as UTF-8.')
    return { kind: ext === '.csv' || ext === '.tsv' ? 'excel' : 'md', title: path.basename(filePath, ext), text }
  }
  if (ext === '.pdf') {
    return { kind: 'pdf', title: path.basename(filePath, '.pdf'), text: await parsePdfFile(filePath) }
  }
  if (['.docx', '.pptx', '.xlsx'].includes(ext)) return {
    kind: ext === '.docx' ? 'word' : ext === '.pptx' ? 'slides' : 'excel', title: path.basename(filePath, ext),
    text: extractOffice(new Uint8Array(fs.readFileSync(filePath)), ext)
  }
  if (ext === '.html' || ext === '.htm') {
    const html = fs.readFileSync(filePath, 'utf8')
    const text = html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').replace(/<!--[^]*?-->/g, '').replace(/<\/(?:p|div|h[1-6]|li|tr)>|<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').trim()
    if (!text) throw new Error('This HTML document has no readable text.')
    return { kind: 'html', title: path.basename(filePath, ext), text }
  }
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return { kind: 'image', title: path.basename(filePath, ext), text: `# ${path.basename(filePath, ext)}\n\nImage source: source/${path.basename(filePath)}\n\nThis image has not been transcribed. Ask the agent to read the source image with read_image and turn its contents into a study note. Image understanding requires a vision-capable model; no OCR is performed during import.` }
  throw new Error(`暂不支持的文件类型 / Unsupported file type ${ext || '(no extension)'}. Use PDF, DOCX, PPTX, XLSX, Markdown, TXT, CSV, HTML or a PNG/JPEG/WebP image. Legacy DOC/PPT/XLS files must be exported to a modern format first.`)
}

export async function parsePdfFile(filePath: string): Promise<string> {
  return parsePdfData(new Uint8Array(fs.readFileSync(filePath)))
}

interface PdfTextItem {
  str?: string
  hasEOL?: boolean
}
interface PdfPage {
  getTextContent(): Promise<{ items: PdfTextItem[] }>
}
interface PdfDoc {
  numPages: number
  getPage(n: number): Promise<PdfPage>
}
interface PdfjsModule {
  getDocument(src: { data: Uint8Array; standardFontDataUrl?: string }): { promise: Promise<PdfDoc>; destroy(): Promise<void> }
}

let pdfjsCache: PdfjsModule | null = null

/**
 * 运行时加载 pdfjs-dist legacy（ESM）：require.resolve 定位文件 + 变量 file-URL 动态导入。
 * 变量说明符绕开 rollup 静态分析（CJS 产物会把静态子路径 import 编译成 require 分块导致挂死）。
 */
async function loadPdfjs(): Promise<PdfjsModule> {
  if (pdfjsCache) return pdfjsCache
  const req = createRequire(__filename)
  const entry = req.resolve('pdfjs-dist/legacy/build/pdf.mjs')
  const mod = (await import(pathToFileURL(entry).href)) as PdfjsModule
  pdfjsCache = mod
  return mod
}

let pdfjsDir = ''
function getStandardFontUrl(): string {
  if (!pdfjsDir) {
    const req = createRequire(__filename)
    pdfjsDir = path.dirname(req.resolve('pdfjs-dist/package.json'))
  }
  // The Node pdfjs factory reads this with fs, so it needs a native path.
  return path.join(pdfjsDir, 'standard_fonts') + path.sep
}

/** pdfjs-dist legacy 文本提取（主进程 Node 环境，纯文本无需 canvas）。 */
export async function parsePdfData(data: Uint8Array): Promise<string> {
  const { getDocument } = await loadPdfjs()
  const task = getDocument({ data, standardFontDataUrl: getStandardFontUrl() })
  const pages: string[] = []
  try {
    const doc = await task.promise
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      let text = ''
      for (const item of content.items) {
        if (item.str !== undefined) {
          text += item.str + (item.hasEOL ? '' : ' ')
          if (item.hasEOL) text += '\n'
        }
      }
      pages.push(`[Page ${i}]\n${text.trim()}`)
    }
  } finally {
    await task.destroy().catch(() => undefined)
  }
  const text = pages.join('\n\n').trim()
  if (!text.replace(/\[Page \d+\]/g, '').trim()) {
    throw new Error('This PDF has no readable text (可能是扫描件，无法提取文本). OCR is not available; import a text-based PDF, Markdown or TXT file instead.')
  }
  return text
}
