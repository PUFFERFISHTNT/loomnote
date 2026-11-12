# Measured evidence

Last updated: 12 November 2026. These are observed technical checks, not human learning/placement scores. Commands and fixtures are versioned; real lecture originals and credential-bearing runtime state are not.

## Local verification (macOS)

| Check | Observed result |
|---|---|
| `pnpm typecheck` | Pass across all four workspace packages. |
| `pnpm test` | 150 passed, 3 skipped, 26 files (25 passed / 1 explicitly skipped live file). |
| Real PDF inputs added through `LOOMNOTE_TEST_PDFS` | 152 passed, 3 skipped, including the 70-page COMP2119 Balanced Trees and 16-page SDST2601 Chapter 2 Counting PDFs. |
| `pnpm build` | Pass for the actual Electron main/preload/renderer bundles. |
| `pnpm test:desktop` | Real built Electron workflow, including import, review, selected merge, per-file failure, concept map and restart persistence. See the attached result JSON and CI artifacts. |
| `pnpm test:live` | Real SDK model/tool/file workflow passed (1 test); local existing credentials, no mocked model response. |

The default skipped cases are the opt-in live runtime test and two optional externally supplied generated-note discipline checks. The default suite contains its own public PDF fixture and does not require private course files. Native SQLite was unavailable in this local environment; the supported atomic JSON fallback was exercised. CI separately reports native module availability.

## Real-course desktop generation and recording

The completed automated recording used the existing configured **DeepSeek official endpoint (`api.deepseek.com`, `deepseek-flash`)**, with the user's explicit permission to send the selected lecture material to that destination.

Inputs:

- `COMP2119_Lecture08_Balanced_Trees_Static.pdf` — 70 PDF pages.
- `SDST2601SH (26-27, 1st) Chapter 2.pdf` — 16 PDF pages, Counting.
- A public synthetic Markdown supplement for the selected-section merge.
- A public synthetic textless PDF for the import-failure boundary.

Observed completed run:

- **16 checkpoints**, **391.18 seconds** of test execution, **zero renderer errors**.
- Live study notes for both real courses, with source-page citations and individual self-test answers.
- An interactive slide-13 right rotation, starting at 50 and promoting 40, exercised through its actual Next button. The completed run's screenshot preserves 32 as the right child of 30 and 45 as the left child of 50; these were visually checked against the lecture.
- An actual refusal to supply answers for a stated assessed exam, offering study support instead.
- Three self-rated reviews retained across app restart; saved preferences and both course records restored.
- A two-course map with **20 specific knowledge points**, definitions, source links and labelled relationships, including AVL balance/rotation and counting/product/permutation/combination concepts.
- Scanned/textless-PDF import refused while the valid second-course file in the same batch succeeded.

The first recording attempt stopped at the second course because the automation toggled an already-open panel closed. The driver was fixed and the complete run was repeated; the failed attempt is not represented as a passing demo. A visual check also caught an incorrect 32-node placement in that first generated demo, illustrating why the sandbox's execution check cannot establish academic correctness. The completed repeat was checked separately.

The private `artifacts/recording-real-courses-v2/` directory retains raw continuous window video, a separate restart capture, checkpoint timings/screenshots, generated note and a successful `result.json`. These include real teaching content and are not distributed in the public repository. A viewing copy must disclose speed changes and the restart join; see [DEMO.md](DEMO.md).

## Platforms and reproducibility

The workflow in `.github/workflows/ci.yml` runs the actual offline suite and Electron restart workflow on both macOS and Windows. The exact GitHub run is the authoritative platform evidence; its artifacts include screenshots/results. Windows passed the complete job after the PDF path/PATH-fixture fixes in [run 43190897443](https://github.com/PUFFERFISHTNT/loomnote/actions/runs/43190897443). The old macos-14 runner was cancelled before any steps; the matrix now uses macos-latest. A local macOS result alone does not establish hosted macOS CI.

A clean-source installation check must use the committed lockfile and public fixtures, without ignored local settings or lecture material. Record its outcome here after execution.

## Limits of the evidence

No human placement ratings, outside-user session, learning-gain measurement or team participation is inferred from automated checks. Structured concept relationships are model-authored study aids that need source review. The interval scheduler records self-ratings, not an assessment of mastery. Alternate model providers, arbitrary Office formatting and vision support are not all established by the DeepSeek live run.
