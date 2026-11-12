# Demo recording

The recording driver operates the built Electron app through Playwright. It does not substitute a mock page, precomputed AI response or artificial progress. Only the native file picker result is supplied programmatically. The resulting video has no team-member speech and is separate from the course's required team Zoom presentation.

## Reproduce

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install ffmpeg
pnpm build
pnpm demo:record
```

Set up your own model configuration first. The default inputs are the synthetic public examples. The command requests live generation, presses the generated demo's Next control, issues an assessed-exam refusal request, rates reviews, applies a merge, imports a second course and a bad PDF, opens knowledge points and verifies persistence after restart.

`artifacts/recording/` contains the first continuous window capture (`loomnote-continuous.webm`), a separate restart capture (`loomnote-restart.webm`), checkpoint screenshots/timings, generated note and `result.json`. A failed run exits nonzero and retains a failure screenshot. Keep failed attempts separate from the completed demo.

## Real local courses

Environment variables let a private recording use actual materials without adding them to Git:

| Variable | Meaning |
|---|---|
| `LOOMNOTE_ARTIFACTS_DIR` | Output directory (default under ignored `artifacts/`) |
| `LOOMNOTE_DEMO_PRIMARY_COURSE` / `LOOMNOTE_DEMO_SECONDARY_COURSE` | Display names |
| `LOOMNOTE_DEMO_PRIMARY_FILE` / `LOOMNOTE_DEMO_SECONDARY_FILE` | Absolute paths to permitted local material |
| `LOOMNOTE_DEMO_PRIMARY_PROMPT` | Override the default AVL demo request; request five self-tests and a Next/Reset demo |
| `LOOMNOTE_DEMO_SECONDARY_PROMPT` | Optional live note-generation request for the second course |
| `LOOMNOTE_E2E_DATA_DIR` | Optional isolated test library; never point this at a personal study library |

Use a permitted model destination before sending real course material. Keep local logs, generated notes and recordings private until any redistribution rights have been checked. The public fixtures can be used for a public walkthrough.

## Inspect before submission

- Confirm `result.json` says `ok: true`, lists the actual inputs and reports zero renderer errors.
- Watch the rendered video, especially source selection, note completion, Next/Reset, answer reveal, refusal text, import error and map definitions/source links.
- Preserve raw continuous video. If a viewing copy changes speed or joins the restart segment, label the speed and the application restart explicitly; do not imply edited playback is uninterrupted real-time.
- Show test evidence separately or as a clearly labelled end card. Keep it consistent with the repository commit and CI run being submitted.
- The final Zoom team presentation is a separate deliverable: every member must speak with their name visible, and the presentation must fit the course's three-minute limit. A scripted product demo cannot substitute for participation.
