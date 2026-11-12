import { spawnSync } from 'node:child_process'

const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'packages/harness/tests/runtime.e2e.test.ts'], {
  stdio: 'inherit', env: { ...process.env, LOOMNOTE_LIVE_TESTS: '1' }
})
process.exit(result.status ?? 1)
