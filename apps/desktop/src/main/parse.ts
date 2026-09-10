import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

export type ParsedDocument = { kind: 'md' | 'pdf'; title: string; text: string }

const TEXT_EXTS = new Set(['.md', '.markdown', '.txt'])

/** 按扩展名分派解析（md/txt 直读；pdf 走 pdfjs 文本提取；其余明确报错，不再静默乱码）。 */
export async function parseDocument(filePath: string): Promise<ParsedDocument> {
  const ext = path.extname(filePath).toLowerCase()
  if (TEXT_EXTS.has(ext)) {
    const text = fs.readFileSync(filePath, 'utf-8')
    return { kind: 'md', title: path.basename(filePath, ext), text }
  }
  if (ext === '.pdf') {
    return { kind: 'pdf', title: path.basename(filePath, '.pdf'), text: await parsePdfFile(filePath) }
  }
  throw new Error(`暂不支持的文件类型 ${ext || '(无扩展名)'}：当前支持 md / markdown / txt / pdf`)
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
  getDocument(src: { data: Uint8Array }): { promise: Promise<PdfDoc>; destroy(): Promise<void> }
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

/** pdfjs-dist legacy 文本提取（主进程 Node 环境，纯文本无需 canvas）。 */
export async function parsePdfData(data: Uint8Array): Promise<string> {
  const { getDocument } = await loadPdfjs()
  const task = getDocument({ data })
  const doc = await task.promise
  const pages: string[] = []
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      let text = ''
      for (const item of content.items) {
        if (item.str !== undefined) {
          text += item.str
          if (item.hasEOL) text += '\n'
        }
      }
      pages.push(text)
    }
  } finally {
    await task.destroy().catch(() => undefined)
  }
  return pages.join('\n\n').trim()
}