import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@loomnote/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@loomnote/memory': fileURLToPath(new URL('./packages/memory/src/index.ts', import.meta.url)),
      '@loomnote/agent': fileURLToPath(new URL('./packages/agent/src/index.ts', import.meta.url))
    }
  },
  test: {
    include: ['packages/*/tests/**/*.test.ts', 'apps/desktop/tests/**/*.test.ts'],
    environment: 'node'
  }
})