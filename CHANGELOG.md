# Changelog

All notable changes to LoomNote (dev-test version) are recorded here.

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
