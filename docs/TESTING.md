# Testing

Use Node.js 24+ and the pinned pnpm version. Run `pnpm install --frozen-lockfile` first. The full suite is versioned in `packages/*/tests` and `apps/desktop/tests`, with root aliases pointing at source; a build is unnecessary for unit tests.

## Offline checks

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:desktop
```

`pnpm test` never makes model requests by default, even if local credentials exist. The live runtime test is explicitly gated by `LOOMNOTE_LIVE_TESTS=1`. Two optional generated-note tests require `LOOMNOTE_SAMPLE_NOTE`; without it they are skipped and reported separately.

| Area | Assertions |
|---|---|
| Core | Markdown/directives, safe demo HTML, stable question identities, per-answer parsing, interval scheduling, selected merge preservation/stale edits, knowledge points/definitions/citations, deduplication inside a course and isolation between courses |
| Main process | PDF/text/Office extraction, malformed/unsupported/textless files, ZIP/XML bounds, source retention, course rename/archive persistence, review/preferences after database reopen, provider auth/error checks, atomic note replacement and watcher fallback |
| Harness | RPC framing, events, stream replay, ask blocks, Node discovery, profile composition |
| Renderer helpers | Markdown sanitisation, source links, demo extraction, sandbox bootstrap/bridge |
| Memory primitives | Chunking, deduplication, recall, folding, rule extraction |

The actual Electron test uses an isolated temporary data directory. It creates a course, generates a tiny readable PDF fixture there, views its pages, opens the labelled offline sample, reveals/rates cards, reviews/applies a merge, imports DOCX and rejects a generated textless PDF within the same batch, views concept maps, saves a preference and restarts. It asserts that courses, review history and preferences survive. Only the native picker result is automated; the real parser, DB, IPC and UI handle the workflow. No course PDF is required in the repository.

Results/screenshots are written to `artifacts/desktop/`. A failure writes `failure.png` and `result.json`, and the command exits nonzero. This is a functional test, not a usability study.

## Your own materials

`LOOMNOTE_TEST_PDFS` accepts local PDF paths separated by the OS path delimiter (`:` on macOS/Linux, `;` on Windows). The PDF suite always includes a generated public fixture when no real input is supplied. Real lecture content is never committed as a fixture.

```bash
LOOMNOTE_TEST_PDFS='/path/to/a.pdf:/path/to/b.pdf' pnpm exec vitest run apps/desktop/tests/pdf-e2e.test.ts
```

```powershell
$env:LOOMNOTE_TEST_PDFS = 'C:\Courses\a.pdf;C:\Courses\b.pdf'
pnpm exec vitest run apps/desktop/tests/pdf-e2e.test.ts
```

## Explicit live checks

```bash
pnpm test:live
```

Supply your endpoint/key/model in the environment or the ignored `config/local.env`. This test starts a real SDK runtime, requests a note in an isolated temporary workspace, checks turn/tool/file events and the note skeleton, and stops the session. It can consume the configured provider's quota. The separate [recording driver](DEMO.md) exercises the real model inside the desktop UI, including an interactive demo and an assessed-exam refusal request.

No automated test establishes educational correctness, the ideal place for a demo, or actual learning gains. Compare outputs to original sources and perform the promised human evaluations separately.

## CI and fresh checkouts

`.github/workflows/ci.yml` runs frozen installation, the real setup entry points, portable Node download/checksum validation, launch smoke, typechecking, offline tests, a built Electron workflow/restart, and PowerShell syntax checks on Windows and macOS. It uploads build outputs plus desktop screenshots/results. Live credentials are not installed in CI. Check the actual run before claiming a platform passed; setup script review alone is insufficient evidence.

Run `pnpm docs:screenshots` after building to refresh the README gallery from an isolated offline library. It uses the bundled synthetic note and generated PDF fixtures, sends no model request and refuses the live mode. The screenshots cover course folders, imports, notes, the agent panel, slides/split/source views, demo controls, merge review, concepts, review and settings.

A reproducibility check should start from a clean checkout and repeat the four offline commands above. Local model settings, lecture files and ignored recordings are not required for this path. The native SQLite smoke reports whether the binding loads; JSON fallback is supported and tested when it does not.
