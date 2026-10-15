# Pipeline

The end-to-end workflow, written so a reviewer can follow it by hand on their own machine — and check every claim as they go.

- [Before you start](#before-you-start)
- [1. Import a lecture](#1-import-a-lecture)
- [2. Type a request](#2-type-a-request)
- [3. Watch the work](#3-watch-the-work)
- [4. Interrupt with a new request](#4-interrupt-with-a-new-request)
- [5. Answer a question when the agent asks one](#5-answer-a-question-when-the-agent-asks-one)
- [6. See the note change in place](#6-see-the-note-change-in-place)
- [7. Check the result](#7-check-the-result)
- [8. Take the note with you](#8-take-the-note-with-you)
- [Demo discipline](#demo-discipline)
- [When something looks wrong](#when-something-looks-wrong)

## Before you start

```bash
pnpm install
pnpm build
./scripts/start.sh          # macOS / Linux
.\scripts\start.ps1         # Windows PowerShell
```

Then open **Settings**, pick the model endpoint (the DeepSeek official API preset is already filled in), paste your API key and save. English is the default interface language; switching to Chinese there also switches the language the agent writes notes in.

The first time a note is talked about, the app looks for a plain Node.js 24+ on the machine and starts the harness runtime with it. If it cannot find one, it says so in the agent panel instead of failing silently — see [SETUP-WINDOWS.md](SETUP-WINDOWS.md) for the Windows paths it searches.

## 1. Import a lecture

Open the **Inbox** and drop in a PDF, a Markdown file or a TXT file (or use the file picker).

- PDF text is extracted locally with pdf.js; nothing is uploaded.
- The import is recorded in the import history with its type and status.
- The material becomes a note you can open straight away in **Notes**.

If a file type is not supported yet, the import is refused with a message. It is never silently truncated or mis-decoded.

## 2. Type a request

Open the note and use the agent panel on the right. Plain words are enough:

```
Turn this lecture into a study note: sections, formulas, and a demo for the queueing result.
```

```
The Little's Law part is still confusing — add a step-by-step visualization.
```

```
Add three self-test questions with the page each answer comes from.
```

The request becomes a turn on the note's harness session. A session is created lazily the first time a note is talked about and kept alive afterwards, so a follow-up question continues the same conversation rather than starting over.

## 3. Watch the work

Everything the agent does appears in the panel as it happens, and it is worth knowing what you are looking at:

| On screen | What it is |
|---|---|
| Reasoning text | The model's own thinking for the current step, replayed at the pace it produced it |
| Answer text | The assistant's visible reply for the step, replayed the same way |
| Tool calls | The tools the model asked for — `read`, `edit`, `glob`, `write` — with their arguments |
| Tool results | What each call returned, including failures, verbatim |
| Turn markers | Where one turn opened and where it closed, with the runtime's end reason |

The runtime publishes a committed message per step rather than per token, but every committed message carries its original model stream — the runs of reasoning and answer deltas with the millisecond gaps between them. LoomNote replays those gaps, which is why reasoning appears to be typed rather than pasted. The replay is presentation only: the committed event always lands afterwards, so what you see can never disagree with what the note contains.

What you will *not* see is a shell command, a subagent, a background job or a plugin being installed: those tools are disabled in the LoomNote profile, so they are not part of the session at all.

## 4. Interrupt with a new request

Press **Stop** in the panel while a turn is running. The session stops the turn; the note keeps whatever was already written, because the note is a file and edits are incremental. Then send a different request — for instance, "keep the structure but make the demo show the queue draining one customer at a time".

Interrupting is a normal way to work here, not a recovery path: the agent edits lines rather than regenerating the document, so stopping mid-turn cannot scramble what was already approved. Pressing **Revert** restores the last saved body if you want to discard an edit of your own.

## 5. Answer a question when the agent asks one

When a request is genuinely ambiguous, the agent ends its reply with a question and 2–5 options rather than guessing. The app renders them as clickable cards below the reply; the panel shows the same event as an *ask*. Clicking a card sends that option's label back as your next message, which continues the turn's work.

Two things worth noting:

- The options are written as complete answers ("Animate the queueing section", not "Option A"), because the label is literally what gets sent back.
- The question arrives in band, as a fenced `loomnote:ask` block in the reply, because an SDK client has no wire method to answer the runtime's blocking ask-user tool. The block is stripped from the displayed message so it never shows up as code.

The agent is told to ask only when the request is genuinely ambiguous, never to confirm something it can already see.

## 6. See the note change in place

The note view has three tabs — **Read**, **Demo** and **Source** — and the body updates while the turn is still running. That is not a preview of a string held in memory: the agent writes `note.md` in the note's own working directory with the runtime's `read` / `write` / `edit` tools, the app watches that file, and each change streams to the view.

The practical consequence is the one the product is judged on: ask for one sentence to change and one part of the file changes. The rest stays byte-identical.

## 7. Put the deck beside the note

An imported PDF is copied into the note's own folder, so the app can show it back to you. Four views sit on the note toolbar:

| View | What it shows |
|---|---|
| **Read** | the note, with each `:::demo` playing inline where the agent put it |
| **Slides** | the original deck, one page at a time, with page navigation |
| **Slides + note** | the deck on the left and the note on the right — walk the deck to the slide a section came from and read the note's version of it next to it |
| **Demo** | the note's interactive demo on its own, at full size |

Every rail folds: the navigation strip, the note list and the agent panel each collapse on their own, and the two rail preferences survive a restart. Folded down, the pair view has room for both the deck and the note.

The agent can see these pages too. Each page is rasterised once into `source/pages/pNNN.png`, and the agent reads the ones it needs with its image tool before writing a caption — so an embedded figure is one it has actually looked at.

## 8. Check the result

A reviewer can verify a finished note without trusting the UI:

1. **Read the body.** Headings, tables and formulas should match the lecture, and the demo block should sit where the concept is explained rather than at the end.
2. **Open the Demo tab.** The demo renders in the sandbox; the panel reports *External requests: 0*. If a generated block fails the discipline check it is blocked with a message instead of being rendered.
3. **Read the Source tab.** It is the raw Markdown, including the `:::demo … :::` slot. This is exactly the file on disk.
4. **Check the self-test section.** Each answer should point back at its source, e.g. `(Lecture 3, p. 12)`. The agent is instructed never to invent a page number or formula; if the material does not support one it should say so.
5. **Check the file itself.** The note lives at `<userData>/workspaces/<noteId>/note.md` (see [ARCHITECTURE.md](ARCHITECTURE.md#where-local-data-lives) for the exact roots). Opening it in any Markdown viewer should show the same document the app shows.
6. **Make a small change and compare.** Ask for one line to be reworded and diff the file before and after: the change should be confined to that line.

## 9. Take the note with you

The note is a plain Markdown file, so there is nothing to unlock: open the note's folder, copy `note.md` wherever you keep your material, and it renders in any Markdown viewer that passes inline HTML through. Inline HTML demos are self-contained — they carry their own styles and script and reference no external resources — so a note with a demo keeps working outside the app.

## Demo discipline

An interactive demo is added only when the idea **changes over time or over inputs** — a queue draining, a recursion unwinding, a binary search halving a range, a state machine stepping — and a static table would force the reader to reconstruct the order of events. Otherwise prose, a table or a formula is the better answer, and a demo that merely decorates one is a failure of the same rule.

When a demo is written, it must be:

- **One self-contained block.** Inline styles and inline script inside a single root element, with `:::demo <title>` on its own line above and a closing `:::` on its own line below.
- **Zero external requests.** No `http(s)` URLs at all — no images, fonts, scripts, stylesheets or `fetch()` targets. A note must render the same on a machine with no network.
- **One root element**, prefixed so its styles cannot leak into the note around it.
- **At most eight steps.** A demo is a thing to click through in a minute; anything longer is a chapter.
- **Free of the blocked constructs:** external scripts, `window.open`, navigation of the host page, and `backdrop-filter` (which is both a rendering hazard and a performance one).

Enforcement is layered rather than advisory: the persona asks for these rules, `validateDemoHtml()` in `packages/core` rejects a block that breaks them before it reaches the DOM, and the sandbox the block finally runs in has a CSP of `default-src 'none'` with no same-origin access — so even a rule-breaking demo has nowhere to go.

## When something looks wrong

- **Nothing appears in the panel.** Check the session status indicator: a session that never became `ready` prints the reason, usually a missing model credential or no plain Node.js 24+ on the machine.
- **A turn ends with an error event.** The message is the provider's own text — a rejected key, an unknown model id, a rate limit — surfaced verbatim rather than swallowed, so a note never silently stops growing.
- **A demo is blocked.** The view says it failed the discipline check and shows which rule tripped. Ask the agent to rewrite it; the check is a gate, not a crash.
- **The note looks stale.** It is a file: check `note.md` on disk and the app will have followed it. If the file changed and the view did not, the watcher is the thing to look at, not the note.
