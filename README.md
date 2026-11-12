# LoomNote

LoomNote is a desktop study workspace for turning course material into editable notes, interactive explanations, a persistent review queue and course knowledge-point maps. It is built for AILT9019 · AI Literacy II, HKU (Fall 2026).

Start by creating a course, import its materials, and ask the study agent to organise them. The original source stays beside the note. Knowledge points such as **AVL balance factor**, **right rotation**, **permutations** and **combinations** become map nodes with definitions, relationships and links back to the source. Select one course or several courses in the map.

## What works

- **Course library:** create, rename, archive and restore courses; upload multiple files into a course; move a note between courses; search/filter notes by course.
- **Common document formats:** PDF, DOCX, PPTX, XLSX, Markdown, TXT, CSV/TSV, HTML, JSON, TeX and log text. PNG/JPEG/WebP sources can be interpreted by a vision-capable model. See the boundaries below.
- **File-backed notes:** the agent reads and edits `note.md` using the DeepSeek Harness runtime (`@deepseek-ai/dsh@0.2.0-rc.2`), with visible tool calls and streamed responses. Follow-up requests can change a specific passage.
- **Original lecture view:** PDF pages, a side-by-side slide/note view, source selection for merged lectures, and source-page links from review cards and knowledge points.
- **Interactive explanations:** `:::demo` blocks run in isolated iframes with a restrictive CSP. The app checks HTML discipline and whether the demo draws and responds to a control. Next/Reset interactions are exercised in the live recording.
- **Reviewable merge:** preview additions and updates from another lecture, then apply selected changes. Existing sections are retained unless explicitly selected; stale proposals are refused. Both original sources remain available.
- **Review centre:** self-test questions become cards with individual answers and page citations. Reveal, self-rate Again/Hard/Good/Easy, and return later. History and due times survive a restart. This is a simple, documented interval scheduler, not FSRS or an automatic assessment of understanding.
- **Knowledge-point maps:** definitions and explicit relationships are extracted alongside generated notes. The same point across notes joins within its course; different courses remain distinct. Existing notes fall back to meaningful headings and bold definitions. Files and folder names are provenance, not map nodes.
- **Simple preferences:** explicitly ask “Remember: use inline formulas”, or edit/delete preferences in Settings. Preferences and self-rated review history inform later requests without another memory service.
- **Offline sample and bilingual interface:** open the clearly labelled bundled sample without a model key. English and Chinese interfaces are available.

## Requirements and setup

Use **plain Node.js 24+** and **pnpm 10** (the lockfile pins pnpm 10.34.5). The harness runs under system Node, because its native add-ons cannot use Electron-as-Node. Set `LOOMNOTE_NODE` if Node is installed in a nonstandard location.

```bash
# macOS
./scripts/setup.sh
./scripts/start.sh
```

On Windows, install Node.js 24+, then double-click **setup.cmd**, followed by **start.cmd**, or use PowerShell:

```powershell
.\scripts\setup.ps1
.\scripts\start.ps1
```

The Windows setup installs pnpm for the current user when necessary and attempts the SQLite rebuild. Missing native SQLite support uses the supported local JSON store. No C++ compiler is required for that fallback. The command wrappers also work when PowerShell's script execution policy blocks a direct invocation. Scripts keep errors visible and find a refreshed Node installation through the registry PATH.

Manual setup and development:

```bash
pnpm install --frozen-lockfile
pnpm setup:electron
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

The startup scripts load optional `config/local.env`; copy [config/local.env.example](config/local.env.example) and supply your own values. Alternatively, configure an endpoint in **Settings**, check its connection, save, and open a note's agent panel. The default preset is DeepSeek official; an OpenAI-compatible endpoint can be added. A models-list connection check verifies authentication/model availability, not whether generation or image understanding will succeed.

## Try the complete workflow

1. Open **Courses**, create `COMP2119`, and choose **Upload material**. Import [examples/COMP2119/lecture-01.pdf](examples/COMP2119/lecture-01.pdf), a three-page synthetic deck that can be redistributed. The original PDF opens immediately; AI generation is a separate, explicit request.
2. Open its note and ask:

   > Organise the material in source/extracted.md into an English study note with formulas, a comparison table and five self-test questions with individual answers and page citations. Include specific knowledge points and their relationships for the course map. Add a short Next/Reset right-rotation demo where it helps explain the change.

3. Check **Read**, **Slides + note**, **Demo** and **Source**. Compare the citations and mathematics against the source. The formula and demo checks cannot establish academic correctness.
4. Choose **Merge lecture**, select [lecture-02.md](examples/COMP2119/lecture-02.md), review the proposed additions/updates and apply only what you want. Check that the first note remains intact.
5. Open **Review**, reveal an answer and rate it. Restart the app and verify the saved due times/history.
6. Open the course's **Knowledge map**. Select a point to inspect its definition, relationships and source notes. Create a second course and use the checkboxes to display both maps.
7. Import [examples/textless.pdf](examples/textless.pdf) to observe the explicit scanned/textless-PDF refusal. Other members of a batch still import successfully.

Without a credential, **Open offline sample** on the workbench exercises the note, demo, review and map paths with a bundled synthetic note. It is not presented as fresh AI output.

## Format boundaries

| Format | Local extraction and boundary |
|---|---|
| PDF | Text and PDF page indexes; original pages remain viewable. A scanned/textless PDF is refused because no OCR is bundled. |
| DOCX / PPTX | Paragraphs and table text / ordered slide text. Complex layout and embedded diagrams need checking against the original. |
| XLSX | Sheet/cell labels and cached values, including cached formula results. Formulas are not recalculated. |
| Markdown / TXT / CSV / TSV / JSON / TeX / LOG | UTF-8 text; structured formats are preserved as text for the agent. |
| HTML / HTM | Local text extraction; scripts/styles are not executed. |
| PNG / JPG / JPEG / WebP | Original image retained. Import does not perform OCR; interpretation requires a configured vision-capable model. |
| Legacy DOC / PPT / XLS | Explicit refusal; export to a modern Office format first. |

Imports are limited to 50 MB per file. Office archives also have expansion/entry/text limits; DTD/entity declarations are refused. These are document-to-text imports, not full Office rendering engines.

## Tests and recording

```bash
pnpm typecheck
pnpm test             # offline; never silently invokes a paid model
pnpm build
pnpm test:desktop     # actual built Electron workflow, including restart
pnpm test:live        # explicit real model test; uses your configured credentials
pnpm demo:record     # actual Electron + real model; saves local video/evidence
```

The repository includes the test suite, public input fixtures, frozen lockfile and macOS/Windows CI. The desktop test automates the native picker result; extraction, persistence, views and review actions run in the real app. The recording is an automated demonstration and can make external model requests; it uses isolated app data and does not overwrite your study library. See [TESTING](docs/TESTING.md), [DEMO](docs/DEMO.md) and the measured [EVIDENCE](docs/EVIDENCE.md).

## Local storage and model requests

Notes, sources, preferences, settings and review history are stored under Electron's user-data directory (`LOOMNOTE_DATA_DIR` can override it). The store uses SQLite when its native binding is available and JSON otherwise. `note.md` and its `source/` folder are ordinary local files; retain the whole folder when copying a note with images.

**When you ask the agent to work, the relevant material and your request are sent to the model endpoint you configured.** There is no LoomNote backend or account. Disabling web tools does not disable model requests. Use only materials you are entitled to process with that provider.

API keys are stored locally in settings and supplied to the child runtime through environment variables, rather than written into its profile overlay. The local settings store is **not encrypted**; protect the OS account and do not share its data folder, `config/local.env`, or raw runtime logs. Real HKU course originals and generated private evidence are excluded from the public repository.

## Repository and documentation

| Path | Responsibility |
|---|---|
| `packages/core` | Markdown IR, demo validation, review scheduling, merge diffing, concept extraction |
| `packages/memory` | Lightweight local memory primitives; no hosted memory dependency |
| `packages/harness` | Child process/SDK bridge, events, stream replay, agent profile |
| `apps/desktop` | Electron main/preload/renderer, document import, courses, study UI, persistence |
| `examples` | Redistributable synthetic inputs and expected outcomes |
| `scripts` | Setup/start, live test and actual desktop recording driver |

- [Architecture](docs/ARCHITECTURE.md) — process boundaries, local data and sandbox design.
- [Workflow](docs/PIPELINE.md) — imports, generation, merging, review and maps.
- [Testing](docs/TESTING.md), [evidence](docs/EVIDENCE.md), [demo recording](docs/DEMO.md).
- [Final deliverable checklist](docs/FINAL-CHECKLIST.md) — course criteria and remaining human deliverables.
- [Changelog](CHANGELOG.md).

## License

UNLICENSED — all rights reserved. This is a public source repository for a course/product project; see [LICENSE](LICENSE). Course/team planning material is kept outside the public tree.
