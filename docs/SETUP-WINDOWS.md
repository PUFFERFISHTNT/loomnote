# Setup on Windows

What is different on Windows: the PowerShell entry points, the plain-Node requirement (Windows machines very often have an Electron-as-node or a WSL Node on `PATH` and no system Node), and where the app keeps its data.

## Install and launch

```powershell
# from the repository root, in PowerShell
.\scripts\setup.ps1      # check toolchain, pnpm install, pnpm test, pnpm build, fetch the Electron binary
.\scripts\start.ps1      # build on first run, then launch the app
```

`setup.ps1` verifies that a Node.js 24+ and a pnpm 10 are on `PATH` before it does anything else, runs the suite, builds the app, and downloads the Electron binary when it is missing. `start.ps1` loads `config/local.env` into the process environment when that file exists, removes `ELECTRON_RUN_AS_NODE` from the environment (a host process can set it and make Electron behave as plain Node), builds once if `apps\desktop\out\main\index.js` is absent, and launches Electron from the repository rather than through a shell shim.

Equivalent manual commands:

```powershell
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

If PowerShell refuses to run the scripts, unblock them for this checkout:

```powershell
Unblock-File .\scripts\*.ps1
# or bypass the policy for this session only
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

## The plain-Node requirement

The harness runtime loads native add-ons that only load under a normal Node.js. Electron ships its own Node, and under it the runtime refuses to start — so the app locates a real Node on your machine when it needs one.

Check what a `node` on your `PATH` actually is:

```powershell
node -p "process.versions.electron || 'plain node'"
```

- `plain node` → this is a real Node.js; check the version with `node -v` (needs to be 24 or newer).
- a version number → this is Electron running as Node. The harness will not start under it; install Node.js 24+ from <https://nodejs.org> and make sure it comes first on `PATH`.

To point the app at a specific executable regardless of `PATH`:

```powershell
$env:LOOMNOTE_NODE = "C:\Program Files\nodejs\node.exe"
```

The app reads `LOOMNOTE_NODE` first. Failing that, on Windows it probes, in order: `%ProgramFiles%\nodejs\node.exe`, `%LOCALAPPDATA%\Programs\nodejs\node.exe`, `%APPDATA%\npm\node.exe`, then every directory on `PATH`. Each candidate is asked what it is (`process.version` and whether it is Electron) and rejected if it is an Electron binary or older than 24; if nothing qualifies, the agent panel reports what was tried and why each candidate failed.

Notes that follow from this:

- A Node installed only inside WSL is not visible to the app. Install the Windows build as well.
- The launcher scripts deliberately start Electron from a real terminal. Launching the app from an environment that injects `ELECTRON_RUN_AS_NODE=1` makes Electron run as Node and the window never appears.

## Where the app keeps its data

Everything lives under Electron's per-app `userData` directory — by default `%APPDATA%\<app name>`, i.e. `C:\Users\<you>\AppData\Roaming\<app name>`:

```
<userData>\
  loomnote.db                  notes, imports and settings (SQLite, WAL)
  workspaces\<noteId>\note.md  the note the agent reads and edits
  harness\                     harness home: sessions and loomnote-study.patch.yml
```

To move that somewhere else — a fast drive, or a throwaway directory for a demo — set `LOOMNOTE_DATA_DIR` before launching:

```powershell
$env:LOOMNOTE_DATA_DIR = "D:\loomnote-data"
.\scripts\start.ps1
```

Two related facts:

- **SQLite has a fallback.** The store uses `better-sqlite3`, a native module. When its binding cannot load (no prebuilt binary for the Node/Electron ABI in use, and no build tools to compile it), the app opens a JSON store next to it and the storage row in the UI says which one is in use. Installing with `pnpm rebuild better-sqlite3` — which needs the Visual Studio Build Tools when no prebuild is available — switches it back to SQLite.
- **Development credentials.** `config/local.env` is read by `start.ps1` (and by the live harness test) for local runs and is git-ignored. Settings saved in the app — including the model API key — are stored in the local store above, never in the repository.

## See also

- [README.md](../README.md) — requirements and quick start.
- [ARCHITECTURE.md](ARCHITECTURE.md) — what each directory under `userData` is for.
- [TESTING.md](TESTING.md) — running the suite, including the live harness test on Windows.
