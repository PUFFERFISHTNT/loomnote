import { defineConfig } from 'electron-vite'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      rollupOptions: {
        // 子路径也必须 external（'pdfjs-dist' 字符串只精确匹配包名，
        // 之前 legacy/build/pdf.mjs 被打进 CJS 分块转 require → 运行时挂死）
        external: (id: string) => id === 'better-sqlite3' || id.startsWith('pdfjs-dist')
      }
    }
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        output: { format: 'cjs' }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: 'out/renderer',
      rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') }
    }
  }
})