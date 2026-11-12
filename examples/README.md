# Public example inputs

These tiny text and Office materials are synthetic, authored for this repository. They are not HKU lecture originals and must not be cited as actual course teaching or human evaluation results. PDF inputs are generated at runtime in isolated test data and are intentionally not stored in this repository.

| Input | Expected result |
|---|---|
| `COMP2119/lecture-02.md` | Reviewable Deletion/Complexity sections; default additions preserve existing note text, while updates require selection. |
| `ECON1010/markets.docx` | Word paragraphs about supply/demand; imported as readable text under a second course. |
| `unsupported.doc` | Explicit legacy DOC/unsupported-format failure. |

The offline sample in `apps/desktop/data/` contains a complete illustrative note/demo/self-test. Live generated wording varies by model. A successful generation should retain the note skeleton, individual answers/citations, meaningful knowledge points and a functioning isolated demo if requested; compare academic claims to the source yourself.

`pnpm test:desktop` uses the Markdown and DOCX files above and creates its small readable and textless PDF inputs inside the isolated temporary data directory. Real HKU lectures were additionally tested locally and are excluded from this repository.
