# Architecture

How LoomNote is put together: what runs where, why the agent is a separate process, how a runtime event becomes something on screen, and where every byte of local state lives.

- [The shape of the system](#the-shape-of-the-system)
- [Package boundaries](#package-boundaries)
- [Why the agent runs as a supervised child process](#why-the-agent-runs-as-a-supervised-child-process)
- [The profile overlay](#the-profile-overlay)
- [The permission preset](#the-permission-preset)
- [Event vocabulary and the one-way flow](#event-vocabulary-and-the-one-way-flow)
- [Where local data lives](#where-local-data-lives)
- [Security posture](#security-posture)
- [What is deliberately absent](#what-is-deliberately-absent)

## The shape of the system

```
┌─ Electron app ───────────────────────────────────────────────────────────┐
│  renderer (React)                                                        │
│    note view · demo sandbox · chat panel · settings                      │
│        ▲  IPC (contextBridge)                                            │
│  main process (Node inside Electron)                                     │
│    app lifecycle · SQLite store · note workspace · file watching         │
└────────┬─────────────────────────────────────────────────────────────────┘
         │ spawn() + stdio JSON-RPC (the runtime's published SDK protocol)
         ▼
┌─ DeepSeek Harness runtime ───────────────────────────────────────────────┐
│  dsh --profile sdk --patch <generated overlay>                           │
│  plain Node.js 24+ · own native add-ons · session log · model routes      │
│  working directory = the note's own folder                               │
└──────────────────────────────────────────────────────────────────────────┘
```

Four moving parts, three of them processes, one of them a library:

| Part | Runs as | Owns |
|---|---|---|
| Renderer | Electron renderer process | Presentation: note body, demos, chat transcript, settings UI |
| Main process | Electron main process | Persistence, note files, request routing, harness supervision |
| Harness runtime | A supervised child process on plain Node | Reasoning, tool execution, the durable session log |
| `@loomnote/harness` | A library inside the main process | The protocol, the profile, the translation between the two worlds |

## Package boundaries

```
packages/core/      Pure logic shared by everything: the note IR, the demo HTML
                    discipline validator, feature analysis. No I/O, no Electron.
packages/memory/    The local memory engine: chunking, dedup, recall, folding, rules.
packages/harness/   The DeepSeek Harness bridge — the only package that knows the
                    runtime exists.
apps/desktop/       The Electron application: main, preload, renderer, tests.
apps/desktop/src/main/harness-host.ts   one harness session per note, plus the file bridge
apps/desktop/src/main/workspace.ts      the note working directory (note.md)
apps/desktop/src/main/db.ts             the local store (SQLite, JSON fallback)
```

`@loomnote/core` and `@loomnote/memory` are dependency-free of Electron so they can be tested as plain modules. `@loomnote/harness` depends only on `@loomnote/core` and on the runtime package; it declares the SDK wire shapes it uses locally (`packages/harness/src/types.ts`) instead of importing the runtime's internal type graph, so the bridge stays testable and a protocol change becomes a compile error in one file.

## Why the agent runs as a supervised child process

`packages/harness/src/session.ts` spawns the runtime; it never imports it into the main process. Three reasons:

1. **Native add-ons.** The harness loads native modules whose loader supports plain Node only. Inside Electron-as-node they refuse to start, which makes the runtime a foreign process rather than a library.
2. **Blast radius.** The runtime brings its own plugin tree and its own failure modes. As a child process, a harness crash is a session that can be restarted; as an in-process dependency, it would take the app down with it.
3. **A lifecycle the app can reason about.** `start()` (resolve Node → compose the profile → spawn → handshake), `prompt()` (queue one user message, return the durable receipt), `stop()` (ask the runtime to dispose its tree, escalate to `SIGKILL` after a grace period), `kill()` (used on quit). The session is not safe for concurrent prompts, and it is not meant to be: a note has one conversation.

The child is spawned with `cwd` set to the note's working directory, `DSH_HOME` set to the app's own harness home, and `ELECTRON_RUN_AS_NODE` deleted from the environment so a host that injects it cannot poison the child.

## The profile overlay

The app does not drive the stock `sdk` profile; it composes its own overlay on top of it. `loomnote-study.patch.yml` is generated at runtime (`packages/harness/src/profile.ts`) and passed as `dsh --profile sdk --patch <file>`. It exists because a patch is the runtime's supported extension point, and because what it encodes — persona, tool roster, permissions, model routes — depends on the student's settings and would go stale as a checked-in fixture.

The overlay does three things:

**1. The persona.** The agent maintains exactly one Markdown file, `note.md`, in its working directory. The persona fixes the note's skeleton (`# title` → `:::toc` → sections → `## Quick recall` → `## Self-test`), states the editing contract (read before you change; use `edit` for changes to an existing note and `write` only for the first creation; never rewrite the whole note for a small change), defines when a demo is worth writing, and sets the honesty rules (never invent a page number, formula or citation; do not write exam or assignment answers). It is kept in source rather than in a settings file precisely so a user cannot silently break the product's behavioural contract — the language switches are the only variable part.

**2. The tool roster.** `DISABLED_ROWS` turns off the rows the SDK profile ships that a study-notes app has no use for:

| Disabled | Why |
|---|---|
| `tool-bash`, `tool-pwsh` | The agent edits a note; it does not run the machine |
| `tool-jobs` | Background job surface, unused without subagents |
| `tool-subagent*`, `tool-workflow`, `workflow-ptc` | One note is one agent's work |
| `tool-goal`, `tool-ralph`, `tool-todo` | Goal/loop machinery belongs to long autonomous runs |
| `tool-skill`, `skill*`, `tool-plugin-manager` | A note must not pull unreviewed code into the session |
| `tool-web*` | Disabled unless the student turns web access on |

What remains is the file tools (`read` / `write` / `edit`), the search tools (`glob` / `grep`), and — only when enabled in Settings — one web fetch, for checking a source. Row ids are asserted against the runtime in tests rather than grown by hand: an id that does not exist would fail profile composition.

**3. Model routes.** The built-in DeepSeek adapter serves the official API. Every additional OpenAI-compatible endpoint the student adds becomes a route in the overlay (`llm-pi-ai` block) with its `baseURL`, model ids and the *name of the environment variable* that carries its key. The key itself is never written into the overlay — it travels in the child process environment.

## The permission preset

The overlay installs one permission preset, `loomnote-note-workspace`, and makes it the session default:

```yaml
sandbox: workspace-write
approval: never
```

`workspace-write` means the note's own folder is writable, and anything outside it is refused. `approval: never` is not a convenience setting — it is a consequence of the transport. An SDK client has no wire method to answer a blocking approval prompt, so a request that leaves the workspace would wait forever on a decision nobody can deliver. Refusing is the only honest outcome.

Because a patch replaces a config block wholesale, the shipped presets (`read-only`, `workspace-write`, `danger-full-access`) are restated in the generated overlay so the rest of the runtime keeps working.

## Event vocabulary and the one-way flow

The runtime's durable session log is the source of truth, and the flow is one-way:

```
runtime session log  →  normalizeSessionEvent()  →  HarnessEvent  →  IPC  →  renderer
   (session.event)        packages/harness/src/events.ts
```

`HarnessEvent` (`packages/harness/src/types.ts`) is the only vocabulary anything above the bridge speaks:

| Event | Meaning |
|---|---|
| `status` | Process/session lifecycle: starting, ready, running, idle, error, stopped |
| `thinking-delta`, `message-delta` | Live reasoning/answer text during a replay |
| `thinking`, `message` | The same text, committed and complete for that step |
| `tool-call`, `tool-result` | A tool the model asked for, and what came back |
| `turn-start`, `turn-end` | Turn boundaries, with the runtime's own end reason |
| `note-changed` | `note.md` changed on disk |
| `ask` | The agent asked the student to choose; render option cards |
| `error`, `log` | Failure surfaced verbatim; runtime diagnostics |

Two rules keep this honest:

- **Anything not modelled is dropped, not guessed at.** A runtime upgrade cannot silently change product behaviour, because an unmodelled event simply produces no `HarnessEvent`.
- **The committed event always follows the replay.** `expandStream()` reconstructs the model's original order and millisecond gaps from the packed delta runs on the committed message, and `replayStream()` plays them back at that pace (clamped, and compressed to a ceiling rather than truncated). The replay is presentation only — if it is flushed or cancelled, the committed `thinking` / `message` event still arrives, so nothing the student saw can diverge from what the note contains.

Turn-end handling shows the same discipline in reverse: when a turn closes while text is still replaying, the replay is flushed so the live view cannot lag behind the committed one.

## Showing the deck back to the reader

A PDF import is copied into the note's own folder as `source/<name>.pdf`, and one PNG per page is rasterised beside it in `source/pages/`. That single decision serves two features:

- **The reader sees the lecture, not our extraction of it.** A `PdfViewer` in the renderer draws the deck with pdf.js, and a *Slides + note* view puts it beside the note written from it.
- **The agent can look at a page.** `read_image` is left enabled in the profile precisely so the agent can open `source/pages/pNNN.png`, see a diagram, and embed it — rather than describing a picture it never saw.

Note images are referenced the portable way, `![](source/pages/p012.png)`, so the Markdown file renders in any editor. The renderer, which has no filesystem access and lives on a different origin, resolves those paths through a private read-only scheme, `loomnote-asset://note/<noteId>/<path>`. The handler in `apps/desktop/src/main/protocol.ts` serves anything inside that note's folder and refuses everything else, so a model-written path can never become a way to read the disk. The deck itself is read over IPC rather than over that scheme, because the window's origin is `file://` and Chromium refuses a cross-origin request from it to a private scheme.

## Where local data lives

Everything is under Electron's `userData` directory, which `LOOMNOTE_DATA_DIR` can override:

```
<userData>/
  loomnote.db                 notes, imports and settings (better-sqlite3, WAL)
                              — falls back to a JSON file when the native binding
                              is unavailable, e.g. an unrebuilt better-sqlite3
  workspaces/<noteId>/note.md the note file the agent reads and edits
  harness/                    DSH_HOME: the runtime's sessions and the generated
                              loomnote-study.patch.yml
```

- **The note is a file.** `workspace.ts` gives every note a folder and a `note.md`. The agent edits that file with the runtime's own tools; the app watches it, streams each change to the renderer as a live preview, and writes the durable copy back to the database on a debounce so a crash cannot lose a finished note. A small request is a small change because the edit happens where the text lives.
- **Sessions are the runtime's business.** The harness home holds the durable session log, which is what makes resuming a note's conversation possible: reusing a session id resumes the persisted conversation. Nothing under it is read by product code except through the runtime.
- **Settings include the API key.** Keys are stored in the same local settings row as the rest of the configuration and are handed to the child process through its environment; they are never written into the generated overlay and never sent anywhere except the endpoint the student configured. `config/local.env` is a development convenience for supplying the same values from the environment and is git-ignored.

## Security posture

**Demos are sandboxed, and they cannot reach the network.** A demo is rendered as a `data:` URL document inside `<iframe sandbox="allow-scripts allow-forms">` — never `allow-same-origin` — with an immutable meta CSP injected ahead of the content:

```
default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:;
```

A `data:` document does not inherit the parent's CSP, which is the point: the injected policy governs the demo, and `default-src 'none'` means there is no origin to fetch from. Interaction travels over a `MessageChannel` bridge rather than the DOM. Before any of that, `validateDemoHtml()` in `packages/core` rejects a generated block that references an external `http(s)` URL, loads an external script, calls `fetch()` against a remote host, calls `window.open`, navigates the host page, or uses `backdrop-filter`.

**No shell, no plugin manager, no subagents.** Those rows are disabled in the profile overlay, so the capability is absent from the session rather than merely discouraged by the prompt.

**No network unless the student asks for it.** The web tools are disabled unless web access is switched on in Settings, in which case exactly one fetch tool is advertised.

**The app shell is locked down too.** `apps/desktop/src/main/security.ts` denies new windows, allows permission requests only for clipboard reads, restricts in-app navigation to `file:`, `localhost` and `127.0.0.1`, and opens external links through the OS only for `http(s)` URLs.

**The agent does not write exam answers.** The persona refuses that one class of request in a line, and offers to organise the material or set a self-test question instead. The note also carries a standing reminder that its formulas and page references are study aids to check against the lecture.

## What is deliberately absent

- **No server, no account, no telemetry.** Nothing about a session leaves the machine except the model requests the student configured.
- **No second agent loop.** The bridge owns protocol and translation only; planning, tool selection and revision belong to the runtime.
- **No whole-note rewriting on a small request.** The `read` / `write` / `edit` contract and the file-backed workspace exist to make that failure mode structurally unlikely.
