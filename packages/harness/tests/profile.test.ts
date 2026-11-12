import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DISABLED_ROWS, LOOMNOTE_PATCH_FILENAME, NOTE_FILENAME, UNATTENDED_PRESET, WEB_ROWS, buildProfilePatch, ensureProfilePatch, personaPrefix } from '../src/profile.js'

const created: string[] = []

afterEach(async () => {
  for (const dir of created.splice(0)) await rm(dir, { recursive: true, force: true })
})

describe('the LoomNote persona', () => {
  it('states the incremental-edit rule the product is judged on', () => {
    const persona = personaPrefix({ noteLanguage: 'en', chatLanguage: 'en' })
    expect(persona).toContain(NOTE_FILENAME)
    expect(persona).toMatch(/Use `edit` for every change/)
    expect(persona).toMatch(/Never rewrite the whole note/)
  })

  it('separates explaining from editing, which is what the two chat modes rely on', () => {
    const persona = personaPrefix({ noteLanguage: 'en', chatLanguage: 'en' })
    expect(persona).toMatch(/answer in chat\. Do not touch the note/)
    expect(persona).toMatch(/edit the note, then say in one line what changed/)
  })

  it('carries the refusal rule and the demo discipline', () => {
    const persona = personaPrefix({ noteLanguage: 'en', chatLanguage: 'en' })
    expect(persona).toMatch(/do not write exam or assignment answers/i)
    expect(persona).toMatch(/two to six steps/)
    // The demo contract is what keeps generated sandboxes working; it is the
    // product's rule that a note never ships a dead demo.
    expect(persona).toMatch(/script.*at the very end/s)
    expect(persona).toMatch(/never wait for `DOMContentLoaded`/)
    expect(persona).toMatch(/draw something/i)
  })

  it('writes the note and the chat in the configured languages', () => {
    const zh = personaPrefix({ noteLanguage: 'zh', chatLanguage: 'zh' })
    expect(zh).toContain('Write the note in Chinese')
    const en = personaPrefix({ noteLanguage: 'en', chatLanguage: 'zh' })
    expect(en).toContain('Write the note in English')
    expect(en).toContain('Reply in chat in Chinese')
  })
})

describe('the generated profile overlay', () => {
  it('disables the tools a study-notes app has no use for', () => {
    const yaml = buildProfilePatch({ noteLanguage: 'en', chatLanguage: 'en' })
    for (const id of ['tool-bash', 'tool-subagent', 'tool-workflow', 'tool-skill', 'tool-plugin-manager']) {
      expect(DISABLED_ROWS).toContain(id)
      expect(yaml).toMatch(new RegExp(`- id: ${id}\\n  disabled: true`))
    }
  })

  it('keeps the file and search tools the note needs', () => {
    const yaml = buildProfilePatch({ noteLanguage: 'en', chatLanguage: 'en' })
    for (const id of ['tool-fs', 'tool-fs-search', 'tools', 'agent-loop']) {
      expect(yaml).not.toMatch(new RegExp(`- id: ${id}\\n  disabled: true`))
    }
  })

  it('turns the web tools off unless the student asked for them', () => {
    const off = buildProfilePatch({ noteLanguage: 'en', chatLanguage: 'en' })
    const on = buildProfilePatch({ noteLanguage: 'en', chatLanguage: 'en', webEnabled: true })
    for (const id of WEB_ROWS) {
      expect(off).toMatch(new RegExp(`- id: ${id}\\n  disabled: true`))
      expect(on).not.toMatch(new RegExp(`- id: ${id}\\n  disabled: true`))
    }
  })

  it('installs an unattended permission preset so no prompt can hang an SDK session', () => {
    const yaml = buildProfilePatch({ noteLanguage: 'en', chatLanguage: 'en' })
    expect(yaml).toContain(`defaultPreset: "${UNATTENDED_PRESET}"`)
    expect(yaml).toMatch(new RegExp(`${UNATTENDED_PRESET}:\\n        sandbox: workspace-write\\n        approval: never`))
    // The patch replaces a row's whole config, so the shipped presets must survive.
    expect(yaml).toContain('workspace-write:')
    expect(yaml).toContain('danger-full-access:')
  })

  it('declares extra endpoints without ever writing a key into the file', () => {
    const yaml = buildProfilePatch({
      noteLanguage: 'en',
      chatLanguage: 'en',
      providers: [{ route: 'loomnote-active', displayName: 'My gateway', baseURL: 'https://gw.example/v1', apiKeyEnv: 'LOOMNOTE_ACTIVE_PROVIDER_KEY', models: ['my-model'], contextWindow: 65536 }]
    })
    expect(yaml).toContain('loomnote-active:')
    expect(yaml).toContain('apiKeyEnv: "LOOMNOTE_ACTIVE_PROVIDER_KEY"')
    expect(yaml).toContain('baseURL: "https://gw.example/v1"')
    expect(yaml).toContain('- id: "my-model"')
    expect(yaml).toContain('contextWindow: 65536')
    expect(yaml).not.toMatch(/sk-[A-Za-z0-9]/)
  })

  it('omits the extra-route block entirely when there are no extra endpoints', () => {
    expect(buildProfilePatch({ noteLanguage: 'en', chatLanguage: 'en' })).not.toContain('llm-pi-ai')
  })

  it('writes a literal block the YAML parser reads back with the persona intact', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'loomnote-profile-'))
    created.push(dir)
    const file = await ensureProfilePatch(dir, { noteLanguage: 'en', chatLanguage: 'en' })
    expect(path.basename(file)).toBe(LOOMNOTE_PATCH_FILENAME)
    const text = await readFile(file, 'utf8')
    expect(text).toContain('personaPrefix: |-')
    expect(text).toContain('# The note')
    expect(text.trimEnd().endsWith('')).toBe(true)
  })
})
