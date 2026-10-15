# Changelog

All notable changes to LoomNote (dev-test version) are recorded here.

## [Unreleased]

### Added
- **The original deck, shown as a deck.** A PDF import is copied into the note's own folder and rendered page by page in a new *Slides* view; a *Slides + note* view puts the deck beside the note written from it. The note's images are served to the renderer through a private, read-only `loomnote-asset://` scheme that resolves only inside that note's folder.
- **The agent reads the figures itself.** Every PDF page is rasterised once into `source/pages/pNNN.png` (resumable — pages already on disk are skipped), and the profile keeps the runtime's `read_image` tool so the agent can open a page, look at the diagram, and embed it with a caption through an ordinary relative Markdown image. The persona now carries the slide-image contract, including "never point an image at a file you have not looked at".
- **Collapsible panels.** The navigation rail, the note list and the agent panel each fold away independently, and the two rail preferences survive a restart.
- **A growing composer.** The chat input is a textarea that grows with the request, so a multi-sentence instruction is readable while it is being written rather than scrolling out of a single line.
- **The demo sandbox can be driven.** The frame's bridge answers `probe` (list its interactive controls) and `click` (press one by index), through the demo's own element handlers. This is what makes "the demo still plays" checkable without a human, and what the recorded walkthrough uses to exercise a demo.
- `scripts/record-demo.sh` records the one-minute walkthrough against the live system: it points the screen recorder at the window's own reported rectangle, drives the scripted run in `apps/desktop` (`--demo=<pdf>|<request>`), and encodes the result at three speeds (input near real time, thinking compressed, finished note and demo near real time) so the whole pipeline fits the one-minute limit.

### Windows setup
- `scripts\setup.ps1` installs pnpm itself when it is missing (corepack first, then the user-level npm prefix — no admin rights), refreshes `PATH` from the registry so a double-clicked window finds a freshly installed Node.js, and runs `pnpm install` with `CI=true` so pnpm may replace `node_modules` without asking a question it has no way to ask.
- The SQLite native module is prepared for Electron's ABI automatically. It is verified by loading it under Electron rather than by reading an ABI tag out of the binary — node-gyp embeds none, so a working module and a stale one look identical. A running instance is closed first, because Windows keeps the mapped `.node` file locked. When the rebuild fails (no C++ toolchain), the app still runs on the JSON store.
- `scripts\start.ps1` uses `Start-Process -Wait`: PowerShell does not wait for a GUI subsystem process, so the call operator returned at once with a meaningless exit code and the script reported a failure that never happened.
- Both scripts keep their window open when started by a double-click, and never block a non-interactive run.

### Fixed
- A closed `:::toc` block no longer renders its contents as body text. A model reading the persona skeleton would write the section headings *inside* the block, and the page then showed the entire contents list twice.
- The PDF viewer cancels an in-flight `page.render()` before starting another on the same canvas, instead of surfacing pdf.js's "cannot use the same canvas during multiple render operations" as a broken deck.
- The demo sandbox hands its `MessageChannel` port over at most once; a `load` event after the readyState check used to throw `DataCloneError` into the frame's console.
- The generated contents label follows the interface language instead of always reading 目录.

### Changed
- **The agent layer is now an integration with the DeepSeek Harness runtime.** `packages/harness` (`@loomnote/harness`) spawns the runtime as a supervised child process (`dsh --profile sdk --patch <generated overlay>`), speaks the published SDK JSON-RPC protocol over stdio (`initialize` / `session/prompt` / `shutdown`, plus `session.event` and `session.status`), and translates the durable session log into the product's own `HarnessEvent` vocabulary. It replaces the home-grown ~130-line agent loop that used to live in `packages/agent` (removed).
- A generated profile overlay (`loomnote-study.patch.yml`) is composed on top of the shipped `sdk` profile: it sets the study-agent persona, disables the tools a study-notes app has no use for (bash, pwsh, jobs, subagents, workflows, goals, skills, the plugin manager), leaves the file tools, the search tools and an opt-in web fetch, and installs the `loomnote-note-workspace` permission preset (sandbox `workspace-write`, approval `never`).
- Thinking is now streamed as it happened: the runtime publishes a committed message per step, and the original model stream carried by that message — reasoning, answer and tool-argument deltas with their millisecond gaps — is replayed for the "watch it think" view.
- The agent can ask the student to choose: a reply may end with a fenced `loomnote:ask` block, which the app renders as clickable option cards whose click becomes the next user message.
- English is the default interface and note language; Chinese remains one click away in Settings.

### Added
- The note is a real file: every note owns a working directory containing `note.md`, edited in place with the runtime's own `read` / `write` / `edit` tools and watched by the app for live preview.
- Harness runtime discovery: the app locates a plain Node.js 24+ at startup (`LOOMNOTE_NODE` wins), because the runtime's native add-ons refuse to load under Electron's Node.
- English documentation set: `docs/ARCHITECTURE.md`, `docs/PIPELINE.md`, `docs/TESTING.md`, and a rewritten `README.md`.

### Removed
- `packages/agent` — the legacy pre-harness agent loop and its tests, superseded by `packages/harness`.
- Chinese internal planning documents (`docs/drafts/`, `docs/final/`, `WORKFLOW_LESSONS.md`) moved out of the repository; the public tree ships English documentation only.

## [0.1.0] — 2026-09-18

### Added
- Multi-provider settings: custom endpoints + presets (DeepSeek official API first, Volcengine Ark Coding Plan, GLM 5.3 Flash, local Ollama), legacy settings auto-migration.
- AILT9019 course project: proposal draft (kept out of the repo) and Feishu cloud doc.
- GitHub repository & CI (macOS + Windows matrix).

### Fixed
- CI: pnpm/action-setup version conflict (packageManager vs action `version`) — action now reads package.json.
- PDF import in the built bundle: runtime-resolved `require.resolve` + variable file-URL dynamic import replaces the rollup CJS chunk that used to hang.
- Demo sandbox blank content: `data:` URL + `frame-src data: blob:` CSP (srcdoc inherits parent CSP and was blocked).

### Changed
- Plan docs (docs/final 00/05) updated to M0–M2 completed state with measured evidence.

## [0.0.1] — 2026-09-10

- M0–M2 milestone implementation: workspace (core/memory/agent/desktop), md+PDF import, three-mode rendering, demo sandbox, agent runtime panel, live note preview, memory engine v1, 59 tests.
