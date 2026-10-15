/**
 * The LoomNote profile: a patch overlay composed on top of the shipped `sdk`
 * profile, plus the persona the agent runs under.
 *
 * Two things justify a profile of our own rather than driving the stock SDK
 * profile directly:
 *
 * 1. **Tool surface.** The SDK profile advertises a full coding toolbelt —
 *    shells, subagents, workflows, jobs, goals. A study-notes app has no use
 *    for them, and every one of them is a way for a generated artifact to touch
 *    the machine. The overlay disables them by row id and leaves exactly the
 *    file tools, the search tools, and (opt-in) the web tools.
 *
 * 2. **Persona and language.** The stock persona tells the model it is a coding
 *    agent. LoomNote's agent maintains one Markdown note and answers questions
 *    about it; that contract lives here.
 *
 * The overlay is generated rather than shipped as a fixture because it encodes
 * user settings (extra model routes, the web switch, the note language), and a
 * patch is the runtime's own supported extension point.
 *
 * @module
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ASK_INSTRUCTION } from './ask.js'

/** Profile name LoomNote boots. */
export const LOOMNOTE_PROFILE_BASE = 'sdk'

/** File name of the generated overlay inside the LoomNote DSH home. */
export const LOOMNOTE_PATCH_FILENAME = 'loomnote-study.patch.yml'

/** Name of the note file the agent owns, relative to its working directory. */
export const NOTE_FILENAME = 'note.md'

/**
 * Name of the permission preset the overlay installs as the session default:
 * the note workspace is writable, and anything outside it is refused rather
 * than turned into a prompt that an SDK client has no way to answer.
 */
export const UNATTENDED_PRESET = 'loomnote-note-workspace'

/**
 * Base rows the overlay disables. Each id exists in the shipped `sdk` profile;
 * an id that does not would fail profile composition, so the list is asserted
 * against the runtime in tests rather than grown by hand.
 */
export const DISABLED_ROWS: readonly string[] = [
  // Command execution: the agent edits a note, it does not run a machine.
  'tool-bash',
  'tool-pwsh',
  'tool-jobs',
  // Delegation and orchestration: one note is one agent's work.
  'tool-subagent',
  'tool-subagent-fork',
  'tool-subagent-control',
  'tool-subagent-list-agents',
  'tool-workflow',
  // Goal and loop machinery belong to long autonomous runs.
  'tool-goal',
  'tool-ralph',
  'tool-todo',
  // Skills and plugin management would let a note pull in unreviewed code.
  'tool-skill',
  'tool-plugin-manager',
  'skill',
  'skill-filesystem',
  'skill-badge',
  // Background job surface, unused without subagents.
  'jobs',
  'subagent',
  'subagent-spawn-in-process',
  'subagent-fork-in-process',
  'workflow-ptc'
]

/**
 * Rows disabled only when the student has not turned web access on. The
 * proposal keeps one web fetch available for checking a source, off by default.
 */
export const WEB_ROWS: readonly string[] = ['tool-web', 'web-search-deepseek', 'web-fetch-http']

/** One OpenAI-compatible endpoint the student added in Settings. */
export interface ProviderRoute {
  /** Route name the runtime selects models from; must be unique and lowercase-hyphenated. */
  route: string
  /** Human label; shown by selector surfaces. */
  displayName: string
  /** Endpoint root, e.g. `https://api.example.com/v1`. */
  baseURL: string
  /** Environment variable the child process carries the key in; never the key itself. */
  apiKeyEnv: string
  /** Model ids served by this route. */
  models: readonly string[]
  /** Assumed context window for the route's models. */
  contextWindow?: number
  /** Whether the route's models emit reasoning content. */
  reasoning?: boolean
}

export interface ProfilePatchOptions {
  /** Language the note is written in. */
  noteLanguage: 'en' | 'zh'
  /** Language the agent chats in; usually the interface language. */
  chatLanguage: 'en' | 'zh'
  /** Whether the one web-fetch tool is advertised. Default false. */
  webEnabled?: boolean
  /** Extra OpenAI-compatible routes, on top of the runtime's DeepSeek route. */
  providers?: readonly ProviderRoute[]
}

/** Human name of a language, for the persona text. */
function languageName(lang: 'en' | 'zh'): string {
  return lang === 'zh' ? 'Chinese (简体中文)' : 'English'
}

/**
 * The persona prefix. It is the product's behavioural contract, so it is kept
 * in source rather than in a settings file a user could silently break.
 * @param options - language and scope switches.
 * @returns the persona template placed in the profile patch.
 */
export function personaPrefix(options: ProfilePatchOptions): string {
  const noteLang = languageName(options.noteLanguage)
  const chatLang = languageName(options.chatLanguage)
  return [
    "You are LoomNote's study agent, running on the student's own computer.",
    'You turn lecture material into a note they can revise from, and you answer their questions about it.',
    '',
    `# The note`,
    `The note is \`${NOTE_FILENAME}\` in your working directory. It is a plain Markdown file and the only file you own.`,
    '- Read it before you change it. Never edit from memory.',
    '- Use `edit` for every change to an existing note. Use `write` only the first time you create it.',
    '- Never rewrite the whole note to make a small change. Change the lines the request concerns and leave the rest byte-identical.',
    '- These three lines are the rule the product is judged on: the student watches the note change in place, and anything they already approved must survive.',
    '',
    '# Shape of the note',
    'Keep this skeleton stable so the reader never loses their place:',
    '```',
    '# <title>',
    ':::toc   <- exactly this one line; the app builds the contents list from your headings. Never write headings inside it.',
    '## <section>',
    'prose, tables, $$display formulas$$, $inline formulas$',
    ':::demo <short title>',
    '<one self-contained interactive HTML block>',
    ':::',
    '## Quick recall',
    '## Self-test',
    '```',
    'Self-test answers cite where they came from, e.g. `(Lecture 3, p. 12)`.',
    '',
    '# Decide what the student wants before you write',
    '- Asking you to explain, summarise, compare or quiz → answer in chat. Do not touch the note.',
    '- Asking you to add, change, restructure, animate or fix → edit the note, then say in one line what changed.',
    '- Genuinely ambiguous → ask, using the question block below.',
    '',
    '# The lecture you were given',
    '`source/` holds the student\'s own document. For a slide deck it also holds one image per page:',
    '`source/pages/p001.png`, `source/pages/p002.png`, … — the pages as they actually look.',
    '- You can see. Call `read_image` on a page image whenever a diagram, chart, table or worked example carries the meaning',
    '  and the extracted text does not. Read the pages you need, not the whole deck, and only cite a page you actually read.',
    '- When a figure states something better than prose can, embed it in the note with an ordinary relative image and a caption:',
    '  `![Rotation cases after an insertion (slide 12)](source/pages/p012.png)`',
    '- Use the path exactly as written — the note is a portable file and the app resolves `source/…` inside the note\'s own folder.',
    '- Never point an image at an absolute path, a web address, or a file you have not looked at.',
    '',
    '# Interactive demos',
    'Add one only when the idea describes something that changes over time or over inputs — a queue draining, a recursion unwinding,',
    'a state machine stepping, a market reaching equilibrium — and a static table would make the reader reconstruct the order of events.',
    '',
    'Every demo is executed in a locked-down frame before the note is allowed to keep it, and a demo that draws nothing is rejected',
    'and sent back to you. Write it so it passes the first time:',
    '- one self-contained block; inline styles, one inline script, no external URLs, one root element;',
    '- **put the `<script>` at the very end of the block**, never in the middle, and never wait for `DOMContentLoaded` — just run;',
    '- every element the script touches must already exist above it in the same block;',
    '- draw something: an SVG or canvas you fill in, or a table you build. A demo with controls but an empty drawing area is a failure;',
    '- give the reader a visible control — Next / Prev / a slider — over two to six steps.',
    '',
    '# Honesty',
    '- Never invent a page number, formula or citation. If the material does not contain it, say so plainly.',
    '- You do not write exam or assignment answers. That is the one request you refuse — in one line, then offer to organise the material',
    '  or set a self-test question instead.',
    '- Formula and page references are study aids: the note always carries a line saying to check them against the lecture.',
    '',
    '# Asking the student to choose',
    ASK_INSTRUCTION,
    '',
    `# Language`,
    `Write the note in ${noteLang}. Reply in chat in ${chatLang}. Keep chat replies short: the note is the deliverable, not the conversation.`
  ].join('\n')
}

/** Quote one scalar the way YAML reads it back unchanged. JSON strings are valid YAML. */
function yamlScalar(value: string): string {
  return JSON.stringify(value)
}

/**
 * Render a multi-line string as a YAML literal block scalar.
 * @param text - the text to render.
 * @param indent - number of leading spaces for the block's parent key.
 * @returns lines ready to embed.
 */
function yamlBlock(text: string, indent: number): string {
  const pad = ' '.repeat(indent)
  return text
    .split('\n')
    .map((line) => (line.length === 0 ? '' : `${pad}${line}`))
    .join('\n')
}

/**
 * Render the profile overlay.
 * @param options - settings the overlay must encode.
 * @returns YAML text suitable for `dsh --patch`.
 */
export function buildProfilePatch(options: ProfilePatchOptions): string {
  const webEnabled = options.webEnabled === true
  const providers = options.providers ?? []
  const lines: string[] = []

  lines.push('# Generated by LoomNote. Do not edit by hand: it is rewritten whenever Settings change.')
  lines.push(`# Composed as an overlay on the shipped "${LOOMNOTE_PROFILE_BASE}" profile.`)
  lines.push('')

  lines.push('# The agent maintains one note and answers questions about it.')
  lines.push('- id: system-prompt')
  lines.push('  config:')
  lines.push('    personaPrefix: |-')
  lines.push(yamlBlock(personaPrefix(options), 6))
  lines.push(`    personaSuffix: ${yamlScalar(`Your working directory is {{cwd}}. The note you maintain is ${NOTE_FILENAME} in it.`)}`)
  lines.push('')

  lines.push('# An SDK client has no wire method to answer an approval prompt, so a request that')
  lines.push('# leaves the note workspace must fail fast instead of waiting for a decision nobody')
  lines.push('# can deliver. The runtime composes sandbox and approval into one preset, so the')
  lines.push('# unattended pair has to be declared as a preset rather than patched knob by knob.')
  lines.push('# A patch replaces the whole config, so the shipped presets are restated here.')
  lines.push('- id: permission')
  lines.push('  config:')
  lines.push(`    defaultPreset: ${yamlScalar(UNATTENDED_PRESET)}`)
  lines.push('    presets:')
  lines.push(`      ${UNATTENDED_PRESET}:`)
  lines.push('        sandbox: workspace-write')
  lines.push('        approval: never')
  lines.push(`        name: ${yamlScalar('Note workspace (unattended)')}`)
  lines.push(`        description: ${yamlScalar("May read and write inside the note's own folder; anything outside it is refused instead of prompting.")}`)
  lines.push('      read-only:')
  lines.push('        sandbox: read-only')
  lines.push('        approval: ask')
  lines.push('      workspace-write:')
  lines.push('        sandbox: workspace-write')
  lines.push('        approval: ask')
  lines.push('      danger-full-access:')
  lines.push('        sandbox: danger-full-access')
  lines.push('        approval: never')
  lines.push('')

  lines.push('# One note, one agent: nothing here needs a shell, a subagent or a job runner.')
  for (const id of DISABLED_ROWS) {
    lines.push(`- id: ${id}`)
    lines.push('  disabled: true')
  }

  if (!webEnabled) {
    for (const id of WEB_ROWS) {
      lines.push(`- id: ${id}`)
      lines.push('  disabled: true')
    }
  }

  if (providers.length > 0) {
    lines.push('')
    lines.push('# Endpoints the student added. Keys travel in the child process environment, never here.')
    lines.push('- id: llm-pi-ai')
    lines.push('  config:')
    lines.push('    providers:')
    for (const provider of providers) {
      lines.push(`      ${provider.route}:`)
      lines.push(`        displayName: ${yamlScalar(provider.displayName)}`)
      lines.push(`        api: ${yamlScalar('openai-completions')}`)
      lines.push(`        baseURL: ${yamlScalar(provider.baseURL)}`)
      lines.push(`        apiKeyEnv: ${yamlScalar(provider.apiKeyEnv)}`)
      if (provider.reasoning === false) {
        lines.push('        compat:')
        lines.push(`          thinkingFormat: ${yamlScalar('deepseek')}`)
      }
      lines.push('        models:')
      for (const model of provider.models) {
        lines.push(`          - id: ${yamlScalar(model)}`)
        if (provider.contextWindow) lines.push(`            contextWindow: ${provider.contextWindow}`)
      }
    }
  }

  lines.push('')
  return lines.join('\n')
}

/**
 * Write the overlay into the LoomNote DSH home and return its path.
 * @param dshHome - the harness home directory (`DSH_HOME`).
 * @param options - settings the overlay encodes.
 * @returns absolute path of the written patch file.
 */
export async function ensureProfilePatch(dshHome: string, options: ProfilePatchOptions): Promise<string> {
  const file = path.join(dshHome, LOOMNOTE_PATCH_FILENAME)
  await mkdir(dshHome, { recursive: true })
  await writeFile(file, buildProfilePatch(options), 'utf8')
  return file
}
