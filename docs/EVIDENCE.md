# Evidence

What was run, when, and what came back. Every number here is from a command a
reader can re-run; nothing is rounded up or inferred.

The repository ships the product rather than its test suite, so this file is the
record of the suite's runs. The suite itself lives on the development machine.

## Automated suite — 12 Oct 2026

```
$ pnpm test          # vitest, excluding the live-runtime test
 Test Files  21 passed (21)
      Tests  119 passed | 2 skipped (121)
   Duration  1.17s
```

The two skipped cases need a real lecture PDF supplied through
`LOOMNOTE_SAMPLE_NOTE`; they check that every `:::demo` block a model wrote
survives extraction and passes the sandbox discipline validator.

What the suite covers:

| Area | Representative cases |
|---|---|
| Markdown and directives | a `:::demo` immediately after body text is still a demo (it was once swallowed into the paragraph); a closed `:::toc` does not render its contents twice, and does not eat a later block's closing fence; an unclosed demo block is bounded by the next heading instead of running to the end of the note; note-relative image paths resolve |
| Demo sandbox | extraction of every demo in a note, in order, with stable indices; the discipline validator refuses external requests and frame escapes; the frame bootstrap declares no variable twice and defines every function before calling it; the bootstrap is syntactically valid; every demo block in a real note passes |
| Chat rendering | an assistant reply's Markdown becomes elements — `**bold**` no longer reaches the reader as punctuation |
| Harness bridge | JSON-RPC framing and error propagation; event normalisation; stream replay at the model's recorded pace; the ask-block protocol; the profile overlay's contents |
| Memory | chunking, de-duplication, recall and rule folding |
| Desktop main | IPC surface, document parsing, and the note workspace |

```
$ pnpm typecheck        # strict TypeScript, all four packages
packages/core      OK
packages/memory    OK
packages/harness   OK
packages/desktop   OK
```

## The core path, run live — 12 Oct 2026

One completed run, recorded end to end in `AILT9019_Group39_Demo.mp4` (41.6 s,
compressed from 147 s at a stated factor; the whole run is in the clip).

**Input**: `COMP2119_Lecture08_Balanced_Trees_Static.pdf`, 70 slides, and the
request in [README § A worked example](../README.md#a-worked-example-input-and-what-to-expect).

**Observed**, from the run's own logs and the resulting file:

- the run completed with no renderer errors;
- the agent read 16 slide images with `read_image`, wrote `note.md` once, and
  used `edit` for every later change — never a full rewrite;
- the finished note is 302 lines, carries 10 figures each captioned with the
  slide it came from, one interactive rotation demo, and five self-test
  questions that cite their slide page;
- the demo passed the sandbox's runtime check on delivery: 2 controls, 19 drawn
  elements, no error thrown inside the frame.

## Known limitations

- **Only the DeepSeek route is exercised end to end.** Custom OpenAI-compatible
  endpoints are configurable and are passed to the runtime, but have not been
  run against a live endpoint.
- **Windows is unverified on hardware.** The setup and start scripts cover it
  and the file paths are written for it, but no Windows machine has run the app.
- **`better-sqlite3` is not rebuilt for Electron here**, so the app falls back to
  its JSON store. The fallback is a supported path with the same behaviour; the
  setup script attempts the rebuild and continues if it cannot finish.
- **The demo sandbox's runtime check is a floor, not a review.** It proves a demo
  draws something and responds to a control; it cannot tell whether the drawing
  is *correct*. Demo placement is scored by readers in the plan, not here.
- **Interruption is queueing, not cancellation.** The SDK protocol exposes no
  cancel call, so a request typed mid-run is queued and re-thought in place; a
  hard Stop tears the session down and restarts it.
