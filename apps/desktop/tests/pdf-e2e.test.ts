import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { parsePdfFile } from '../src/main/parse.js'

// 真实讲义端到端（文件不存在时跳过，不阻塞 CI/无素材环境）
const SAMPLES = [
  '/Users/yukuan/Desktop/HKU/COMP2119/lecture00_algorithm_scholarly.pdf',
  '/Users/yukuan/Desktop/HKU/AILT9019/Tutorial 1/Tutorial 1.pdf'
]

describe('真实 PDF 端到端（COMP2119 讲义）', () => {
  for (const file of SAMPLES) {
    const present = existsSync(file)
    it.skipIf(!present)(`解析 ${file.split('/').pop()}` + (present ? '' : '（素材缺失，跳过）'), async () => {
      const text = await parsePdfFile(file)
      expect(text.length).toBeGreaterThan(1000)
      // 应含真实学术内容，而非乱码/空白
      expect(text).toMatch(/[A-Za-z]{4,}/)
    })
  }
})