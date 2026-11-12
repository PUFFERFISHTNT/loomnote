# Study workflow

## 1. Create a course and import materials

Create a course in **Courses**, then upload one or several files. The Inbox preselects that course; each file reports its own success or failure. A failed file does not abort the rest of the batch. Empty courses persist, and course rename updates the notes grouped under it. Archiving a course does not delete its notes or sources.

Parsing is local. PDF page indexes, slide markers and spreadsheet cell labels survive text extraction. The source file is copied to the note workspace and its extracted text is retained separately in `source/extracted.md`. The initial note is the extracted content, so importing does not automatically incur a model request. See README for supported formats and boundaries.

## 2. Generate and inspect a study note

Open the note, expand the agent panel and ask it to organise the material. Your request and relevant material are sent to the endpoint configured in Settings. The DeepSeek Harness process plans and uses its file tools inside that note's workspace. Tool calls/results and streamed replies appear in the panel. The app watches the parent directory of `note.md`, with polling fallback, so atomic file replacement does not detach the preview.

The profile asks for headings, formulas/tables, individual self-test answers with citations, and specific knowledge points/relationships. Diagrams can be inspected through locally rasterised source pages if the model supports images. Never treat a model citation as verified solely because it contains a page number.

PDF notes offer **Slides**, **Slides + note**, **Read**, **Demo** and **Source** views. A short follow-up uses `edit` to modify the relevant passage. **Stop** tears down the runtime before the latest file is persisted; it retains completed edits. Source editing is disabled during an active agent turn to prevent competing writers.

## 3. Use interactive explanations where they help

The agent first presents a placement plan: does state change, would a static explanation obscure order, and can the interaction stay within eight offline steps? Each demo has a single root, inline styles/script, a drawn SVG/canvas/table and visible controls. The script is at the end and has no external resources.

Static validation checks the HTML, then a restrictive iframe sandbox/CSP blocks network and host access. The runtime probe checks that something is drawn and controls are present; it does not prove mathematical correctness. A failure is shown with the measured problem so it can be repaired.

## 4. Merge a later lecture

**Merge lecture** prepares a saved preview. Identical sections are skipped; changed headings are updates requiring selection; new sections are additions selected by default. Apply only accepted changes. A checksum and exact base-body comparison refuse proposals if the source or note changed in the meantime. Additional sources live under unique `source/lectures/<id>/` folders, so equal filenames cannot overwrite previous lectures.

This is a deterministic section comparison, not semantic deduplication. PDF/Office additions initially use their extracted text. Ask the agent to organise newly added content and update its concept metadata afterwards.

## 5. Review and return to the source

The review centre reads `## Self-test` blocks, with `### Q1. ...` followed by `Answer: ... (Lecture, p. N)`. Reveal the answer, check the original if needed, then self-rate. Again is due in ten minutes; Hard/Good/Easy use simple increasing day intervals. IDs depend on note/question text, so reordering and answer corrections keep history. Rewriting the question creates a new card.

Progress is stored locally and survives restart. Later requests receive the note's self-rated review history, explicitly described as self-report rather than automatic scoring.

## 6. Explore the course's knowledge points

The map shows specific concepts, never a folder/file tree. A generated note stores an invisible `loomnote:concepts` JSON comment with titles, definitions, note headings, optional PDF page indexes and labelled relationships. Equal normalised titles merge within one course, retaining all source notes. Relations whose endpoints are missing are omitted. Malformed or partially streamed metadata does not crash the map.

Notes without that metadata use meaningful headings and `**term**: definition` lines. Generic headings, self-tests, code examples and demo HTML are excluded. This fallback is a concept index; it does not infer prerequisite relationships. Select a point for its definition and source links. Course checkboxes allow a single map or several maps together while keeping course identities separate.

## 7. Preserve preferences and files

Explicit “Remember: …” / “记住：…” statements are saved as editable preferences. Settings lets the student remove or correct them. No extra memory service is needed. Copy the whole note workspace to retain source assets; interactive `:::demo` blocks require LoomNote or another compatible renderer and are not executed by ordinary Markdown viewers.
