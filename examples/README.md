# Public example inputs

These tiny materials are synthetic, authored for this repository. They are not HKU lecture originals and must not be cited as actual course teaching or human evaluation results.

| Input | Expected result |
|---|---|
| `COMP2119/lecture-01.pdf` | Three readable pages about AVL balance, right rotation and complexity. Import under a chosen course; original pages and extracted text are retained. |
| `COMP2119/lecture-02.md` | Reviewable Deletion/Complexity sections; default additions preserve existing note text, while updates require selection. |
| `ECON1010/markets.docx` | Word paragraphs about supply/demand; imported as readable text under a second course. |
| `textless.pdf` | Explicit no-readable-text/OCR-unavailable failure, without aborting a batch. |
| `unsupported.doc` | Explicit legacy DOC/unsupported-format failure. |

The offline sample in `apps/desktop/data/` contains a complete illustrative note/demo/self-test. Live generated wording varies by model. A successful generation should retain the note skeleton, individual answers/citations, meaningful knowledge points and a functioning isolated demo if requested; compare academic claims to the source yourself.

`pnpm test:desktop` uses these files directly in the built app. Real HKU lectures were additionally tested locally and are excluded from this repository.
