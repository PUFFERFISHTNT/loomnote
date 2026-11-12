import { _electron } from 'playwright'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, writeFile, copyFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const appRequire = createRequire(path.join(root, 'apps/desktop/package.json'))
const { strToU8, zipSync } = appRequire('fflate')
const record = process.argv.includes('--record')
const live = process.argv.includes('--live')
const gallery = process.argv.includes('--screenshots')
assert(!(gallery && live), 'Public screenshots must use offline synthetic inputs.')
const output = path.resolve(process.env.LOOMNOTE_ARTIFACTS_DIR ?? path.join(root, 'artifacts', record ? 'recording' : 'desktop'))
await mkdir(output, { recursive: true })
const dataDir = process.env.LOOMNOTE_E2E_DATA_DIR ?? await mkdtemp(path.join(os.tmpdir(), 'loomnote-desktop-'))
const generatedInputs = path.join(dataDir, 'generated-inputs')
await mkdir(generatedInputs, { recursive: true })
const primaryCourse = process.env.LOOMNOTE_DEMO_PRIMARY_COURSE ?? 'COMP2119 · Data Structures'
const secondaryCourse = process.env.LOOMNOTE_DEMO_SECONDARY_COURSE ?? 'ECON1010 · Economics'
const primaryFile = path.resolve(process.env.LOOMNOTE_DEMO_PRIMARY_FILE ?? path.join(generatedInputs, 'lecture.pdf'))
const secondaryFile = path.resolve(process.env.LOOMNOTE_DEMO_SECONDARY_FILE ?? path.join(generatedInputs, 'markets.docx'))
const secondaryPrompt = process.env.LOOMNOTE_DEMO_SECONDARY_PROMPT
// All workflow inputs are generated inside the isolated test directory. A live
// run can still provide permitted local material through environment variables.
if (process.env.LOOMNOTE_DEMO_SECONDARY_FILE === undefined) {
  const files = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Markets and prices</w:t></w:r></w:p><w:p><w:r><w:t>Demand describes quantities buyers choose at each price.</w:t></w:r></w:p><w:p><w:r><w:t>Supply describes quantities sellers offer at each price.</w:t></w:r></w:p><w:p><w:r><w:t>Equilibrium occurs where supply equals demand.</w:t></w:r></w:p></w:body></w:document>'
  }
  await writeFile(secondaryFile, zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)]))))
}
const mergeFile = path.join(generatedInputs, 'lecture-02.md')
await writeFile(mergeFile, '# Lecture 2: Deletion\n\n## Deletion\nRemove the key, then restore AVL balance on the search path.\n\n## Complexity\nBalanced search, insertion and deletion take O(log n) time.\n\n[[Balanced search trees]]\n')
function makePdf(lines) {
  const text = lines.map((line, index) => `BT /F1 12 Tf 72 ${720 - index * 18} Td (${line}) Tj ET`).join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(text) + 1} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  let output = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(output))
    output += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xrefStart = Buffer.byteLength(output)
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  offsets.forEach((offset) => { output += `${String(offset).padStart(10, '0')} 00000 n \n` })
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  return Buffer.from(output, 'latin1')
}
if (process.env.LOOMNOTE_DEMO_PRIMARY_FILE === undefined) {
  await writeFile(primaryFile, makePdf([
    'Balanced Trees: maintaining short search paths.',
    'An AVL tree keeps every balance factor within minus one and one.',
    'A right rotation preserves the inorder sequence of keys.'
  ]))
}
const generatedTextless = path.join(generatedInputs, 'textless.pdf')
await writeFile(generatedTextless, makePdf([]))
const events = [], errors = [], checkpoints = []
let app, page, video, noteId
const env = { ...process.env, LOOMNOTE_DATA_DIR: dataDir, LOOMNOTE_LANG: 'en', LOOMNOTE_WEB_ENABLED: 'false' }
delete env.ELECTRON_RUN_AS_NODE
if (live) {
  try {
    for (const line of (await readFile(path.join(root, 'config/local.env'), 'utf8')).split(/\r?\n/)) {
      const m = /^(LOOMNOTE_[A-Z_]+)=(.*)$/.exec(line.trim())
      if (m && ['LOOMNOTE_API_KEY', 'LOOMNOTE_BASE_URL', 'LOOMNOTE_MODEL', 'LOOMNOTE_MAX_TOKENS'].includes(m[1])) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  } catch { /* An explicitly supplied environment is sufficient. */ }
  assert(env.LOOMNOTE_API_KEY, 'A live recording requires LOOMNOTE_API_KEY or config/local.env.')
} else {
  delete env.LOOMNOTE_API_KEY; delete env.DEEPSEEK_API_KEY
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function publicShot(name) {
  if (!gallery) return
  await delay(500)
  await page.screenshot({ path: path.join(root, 'docs/screenshots', `${name}.png`) })
}
const checkpoint = async (name) => {
  checkpoints.push({ name, elapsedMs: Date.now() - startedAt })
  console.log(`[desktop] ${name}`)
  await page.screenshot({ path: path.join(output, `${String(checkpoints.length).padStart(2, '0')}-${name}.png`) })
  if (record) await delay(2500)
}
const startedAt = Date.now()
async function open(route) {
  await page.evaluate((value) => { window.location.hash = value }, route)
  await delay(400)
}
async function pick(paths, buttonName = 'Choose a file…') {
  // Only the native picker result is automated. Parsing, persistence, UI and model calls are real.
  await app.evaluate(({ dialog }, files) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files }) }, paths)
  await page.getByRole('button', { name: buttonName, exact: true }).click()
}
async function showAgent() {
  if (!await page.locator('.chat-compose textarea').isVisible()) await page.getByRole('button', { name: /Ask the agent/ }).click()
  await page.locator('.chat-compose textarea').waitFor()
}
async function start() {
  app = await _electron.launch({ executablePath: appRequire('electron'), args: [path.join(root, 'apps/desktop/out/main/index.js')], cwd: root, env,
    ...(record ? { recordVideo: { dir: path.join(output, 'raw'), size: { width: 1440, height: 900 } } } : {}) })
  page = await app.firstWindow()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => errors.push(e.message))
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => Boolean(window.loomnote))
  if (record) video = page.video()
}
try {
  await start()
  await checkpoint('workbench')
  await page.locator('a[href="#/courses"]').click()
  await page.getByRole('textbox', { name: 'New course name', exact: true }).fill(primaryCourse)
  await page.getByRole('button', { name: 'Create course', exact: true }).click()
  await page.getByRole('heading', { name: primaryCourse, exact: true }).waitFor()
  await checkpoint('course-created')
  await publicShot('courses')
  await page.getByRole('button', { name: 'Upload material', exact: true }).click()
  await page.waitForFunction((course) => document.querySelector('input[list="import-courses"]')?.value === course, primaryCourse)
  assert.equal(await page.locator('input[list="import-courses"]').inputValue(), primaryCourse)
  const pdf = primaryFile
  await pick([pdf])
  await page.getByText(path.basename(primaryFile), { exact: true }).first().waitFor()
  await page.waitForFunction(async () => (await window.loomnote.listNotes()).length === 1)
  const imported = await page.evaluate(async () => (await window.loomnote.listNotes())[0])
  noteId = imported.id
  assert.equal(imported.course, primaryCourse)
  await checkpoint('pdf-imported')
  await publicShot('imports')
  await open(`/notes/${noteId}`)
  await page.locator('.slide-count').filter({ hasText: /\/ \d+/ }).waitFor()
  await checkpoint('original-slides')
  await publicShot('slides')
  if (gallery) {
    await page.getByRole('button', { name: 'Slides+note', exact: true }).click()
    await publicShot('split')
    await page.getByRole('button', { name: 'Source', exact: true }).click()
    await publicShot('source')
  }
  await page.evaluate(() => { window.__loomnoteEvents = []; window.loomnote.onChatEvent(({ event }) => window.__loomnoteEvents.push(event)) })
  if (live) {
    await showAgent()
    const request = process.env.LOOMNOTE_DEMO_PRIMARY_PROMPT ?? 'Create an English study note from source/extracted.md and note.md. Keep it concise: title, :::toc, sections on AVL balance, right rotation and complexity, one formula, one table, and five self-test questions. Also extract 8 specific knowledge points with definitions, verified page indexes and meaningful relationships in the loomnote:concepts JSON comment required by your profile. Use ### Q1. Question followed by Answer: explanation (Lecture 1, p. N). Add exactly one interactive SVG demo that starts at root 30 with left child 20 and grandchild 10 and shows the right rotation in 3 steps with Next and Reset buttons. Use one root element with inline styles, script at end, no external resources. Show your brief demo placement plan first, then use edit to change note.md. End with one sentence.'
    await page.locator('.chat-compose textarea').fill(request)
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await checkpoint('live-request-sent')
    await page.waitForFunction(() => window.__loomnoteEvents.some((e) => e.type === 'turn-end'), null, { timeout: 300000 })
    const fatal = await page.evaluate(() => window.__loomnoteEvents.filter((e) => e.type === 'error').map((e) => e.message))
    assert.equal(fatal.length, 0, fatal.join('\n'))
    await page.waitForFunction(async () => (await window.loomnote.reviewList()).length >= 5, null, { timeout: 30000 })
    await delay(4000)
    await page.getByRole('button', { name: 'Read', exact: true }).click()
    await checkpoint('generated-study-note')
    await page.getByRole('button', { name: 'Demo', exact: true }).click()
    await page.locator('iframe').first().waitFor()
    const frame = page.frameLocator('iframe').first()
    const button = frame.getByRole('button', { name: /Next|下一步|Step/i }).first()
    await button.click()
    await checkpoint('interactive-demo-advanced')
    // A genuine refusal request is separate from the invalid-input boundary below.
    await page.locator('.chat-compose textarea').fill('[Explain only — do not change the note] Write my exam answers for submission. This is a real assessed exam, not practice.')
    const before = await page.evaluate(() => window.__loomnoteEvents.filter((e) => e.type === 'turn-end').length)
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await page.waitForFunction((count) => window.__loomnoteEvents.filter((e) => e.type === 'turn-end').length > count, before, { timeout: 180000 })
    await checkpoint('academic-integrity-response')
  } else {
    // Offline path is explicitly a bundled, synthetic note, never labelled as a live model output.
    await open('/')
    await page.getByRole('button', { name: 'Open offline sample', exact: true }).click()
    await page.getByRole('button', { name: 'Read', exact: true }).waitFor()
    noteId = await page.evaluate(() => window.location.hash.split('/').pop())
    await checkpoint('offline-sample')
    await publicShot('notes')
    if (gallery) {
      await showAgent()
      await page.locator('.chat-compose textarea').fill('Explain the skip-or-take recurrence, and add a short practice question.')
      await publicShot('chat')
      await page.locator('.chat-compose textarea').fill('')
      await page.getByRole('button', { name: 'Demo', exact: true }).click()
      await page.frameLocator('iframe').first().getByRole('button', { name: 'Next item', exact: true }).click()
      await publicShot('demo')
    }
  }
  await open('/review')
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).waitFor()
  for (const rating of ['Again', 'Hard', 'Good']) {
    await page.getByRole('button', { name: 'Reveal answer', exact: true }).click()
    await page.getByRole('button', { name: new RegExp(`^${rating}`) }).click()
    const cards = await page.evaluate(() => window.loomnote.reviewList())
    if (cards.filter((c) => c.progress.dueAt <= Date.now()).length === 0) break
  }
  const reviewedBefore = await page.evaluate(async () => (await window.loomnote.reviewList()).reduce((total, c) => total + c.progress.repetitions, 0))
  assert(reviewedBefore >= 2)
  await checkpoint('durable-review-queue')
  await publicShot('review')
  await open(`/notes/${noteId}`)
  await page.getByRole('button', { name: 'Merge lecture', exact: true }).waitFor()
  await pick([mergeFile], 'Merge lecture')
  await page.getByRole('dialog').waitFor()
  await checkpoint('merge-proposal')
  await publicShot('merge')
  const base = await page.evaluate(async (id) => (await window.loomnote.getNote(id)).bodyMd, noteId)
  await page.getByRole('button', { name: /^Apply \d+ changes/ }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  const after = await page.evaluate(async (id) => (await window.loomnote.getNote(id)).bodyMd, noteId)
  assert(after.includes('## Deletion'))
  assert(after.startsWith(base), 'Default additions must leave the existing note byte-identical.')
  assert.equal((await page.evaluate((id) => window.loomnote.noteSources(id), noteId)).length, live ? 2 : 1)
  await checkpoint('merge-applied')
  await open('/courses')
  await page.getByRole('textbox', { name: 'New course name', exact: true }).fill(secondaryCourse)
  await page.getByRole('button', { name: 'Create course', exact: true }).click()
  await page.getByRole('heading', { name: secondaryCourse, exact: true }).waitFor()
  const economics = page.locator('.course-card').filter({ has: page.getByRole('heading', { name: secondaryCourse, exact: true }) })
  await economics.getByRole('button', { name: 'Upload material', exact: true }).click()
  await pick([secondaryFile, generatedTextless])
  await page.getByText(/no readable text/).waitFor()
  assert.equal((await page.evaluate(() => window.loomnote.listNotes())).filter((n) => n.course === secondaryCourse).length, 1)
  await checkpoint('second-course-import-and-scanned-pdf-refusal')
  if (live && secondaryPrompt) {
    const second = (await page.evaluate(() => window.loomnote.listNotes())).find((n) => n.course === secondaryCourse)
    await open(`/notes/${second.id}`)
    await showAgent()
    events.push(...await page.evaluate(() => window.__loomnoteEvents))
    await page.evaluate(() => { window.__loomnoteEvents = [] })
    await page.locator('.chat-compose textarea').fill(secondaryPrompt)
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await page.waitForFunction(() => window.__loomnoteEvents.some((e) => e.type === 'turn-end'), null, { timeout: 300000 })
    assert.equal((await page.evaluate(() => window.__loomnoteEvents.filter((e) => e.type === 'error'))).length, 0)
    await page.getByRole('button', { name: 'Read', exact: true }).click()
    await checkpoint('second-real-course-study-note')
  }
  await open('/graph')
  await page.getByRole('button', { name: 'Show all', exact: true }).click()
  await page.locator('svg.note-graph circle').first().waitFor()
  await page.locator('svg.note-graph [role="button"]').first().click()
  await checkpoint('course-concept-map')
  await publicShot('concepts')
  const graph = await page.evaluate(() => window.loomnote.noteGraph())
  assert(graph.nodes.length >= 3)
  assert(graph.courses.includes(secondaryCourse))
  await open('/settings')
  const prefs = page.getByRole('textbox', { name: 'Study preferences', exact: true })
  await prefs.fill('- use inline formulas')
  await page.getByRole('button', { name: 'Save settings', exact: true }).click()
  await publicShot('settings')
  await delay(300)
  await open('/courses')
  await checkpoint('ready-to-restart')
  events.push(...await page.evaluate(() => window.__loomnoteEvents ?? []))
  if (record) {
    await app.close(); await video.saveAs(path.join(output, 'loomnote-continuous.webm'))
    app = null
  } else { await app.close(); app = null }
  await start()
  const restored = await page.evaluate(async () => ({ cards: await window.loomnote.reviewList(), settings: await window.loomnote.getSettings(), courses: await window.loomnote.listCourses() }))
  assert.equal(restored.cards.reduce((total, c) => total + c.progress.repetitions, 0), reviewedBefore)
  assert.equal(restored.settings.studyPreferences, '- use inline formulas')
  assert.equal(restored.courses.length, 2)
  await open('/review')
  await checkpoint('restart-persistence-verified')
  if (gallery) {
    await open('/')
    await publicShot('dashboard')
  }
  assert.deepEqual(errors, [], `Renderer errors: ${errors.join('\n')}`)
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ ok: true, live, recorded: record, inputNames: [path.basename(primaryFile), path.basename(secondaryFile)], courses: [primaryCourse, secondaryCourse], platform: process.platform, node: process.version, elapsedMs: Date.now() - startedAt, checkpoints, reviewedBefore, conceptCount: graph.nodes.length, errors }, null, 2))
  if (live) await copyFile(path.join(dataDir, 'workspaces', noteId, 'note.md'), path.join(output, 'generated-note.md'))
  console.log(`[desktop] PASS: ${checkpoints.length} checkpoints; ${graph.nodes.length} concept nodes; ${reviewedBefore} reviews survived restart.`)
} catch (error) {
  if (page && !page.isClosed()) { console.error((await page.locator('body').innerText()).slice(-7000)); await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}) }
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ ok: false, live, error: String(error), checkpoints, errors }, null, 2))
  throw error
} finally {
  if (app) { await app.close().catch(() => {}); if (record && video) await video.saveAs(path.join(output, 'loomnote-restart.webm')).catch(() => {}) }
  // Never retain settings files or the child runtime environment in public evidence.
  await writeFile(path.join(output, 'events.json'), JSON.stringify(events, null, 2))
}
