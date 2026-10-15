# Setup on Windows

What is different on Windows: the PowerShell entry points, the plain-Node requirement (Windows machines very often have an Electron-as-node or a WSL Node on `PATH` and no system Node), the native-module rebuild, and where the app keeps its data.

## Install and launch

```powershell
# from the repository root, in PowerShell
.\scripts\setup.ps1      # check the toolchain, install deps, build, fetch Electron, prepare SQLite
.\scripts\start.ps1      # build on first run, then launch the app
```

Both scripts are self-contained. If PowerShell refuses to run them, unblock the checkout once:

```powershell
Unblock-File .\scripts\*.ps1
# or bypass the policy for this one session
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

`setup.ps1` does the following, in order, and stops with an actionable message when something needs a human:

1. **Refreshes `PATH`** from the registry before checking anything. A window opened by a double-click can carry the `PATH` of a long-running `explorer.exe`, so a freshly installed Node.js would otherwise look missing.
2. **Checks Node.js 24+.** Missing or too old → the script stops and names the fix (`winget install OpenJS.NodeJS.LTS`, or <https://nodejs.org>).
3. **Rejects an Electron-as-node.** Native add-ons will not load under it; see below.
4. **Installs pnpm when it is missing.** It tries `corepack enable pnpm` first (this needs admin rights and is allowed to fail), then falls back to `npm i -g pnpm` into the user-level npm prefix, which never needs admin rights. Either way the script then runs with the freshly installed pnpm.
5. **Runs `pnpm install` with `CI=true`.** pnpm refuses to replace an existing `node_modules` when it cannot ask a question, and a double-clicked window cannot answer one — without this the install aborts with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`.
6. **Builds the workspace** (`pnpm build`).
7. **Downloads the Electron binary** when it is missing, through the npmmirror mirror configured in `.npmrc`.
8. **Prepares the SQLite native module** for Electron's ABI — see below.
9. **Keeps its window open** when it was started by double-clicking, so the result is readable.

`start.ps1` loads `config/local.env` into the process environment when that file exists, removes `ELECTRON_RUN_AS_NODE` (a host process can set it and make Electron behave as plain Node, so the window never appears), refreshes `PATH` the same way `setup.ps1` does, builds once if `apps\desktop\out\main\index.js` is absent, and launches Electron directly from the repository. Extra arguments are forwarded to Electron:

```powershell
.\scripts\start.ps1 --remote-debugging-port=9222
```

Equivalent manual commands:

```powershell
pnpm install
pnpm typecheck
pnpm build
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

## The SQLite native module

The store uses `better-sqlite3`, a native module. npm ships a prebuilt binary for **Node's** ABI, but the app runs inside Electron, whose ABI differs — so the prebuilt binary cannot load, and the app falls back to a JSON store (the storage row in the UI says which one is in use; the features are the same either way).

`setup.ps1` handles this on its own:

- It **tests the module by loading it under Electron**, not by reading an ABI tag out of the binary — node-gyp has no reason to embed one, so a working module and a stale one look identical from the outside. The probe opens an in-memory database, creates and drops a table, and reports success.
- If the probe fails, it compiles the module for Electron's ABI with the `node-gyp` that ships inside npm, using the Electron headers. This needs the **Visual Studio Build Tools with "Desktop development with C++"** and Python; when they are absent the build fails cleanly and the app keeps working on the JSON store.
- Before compiling it **closes a running LoomNote instance**. Windows keeps the `.node` file locked while it is mapped, and node-gyp cannot replace a locked file (`EPERM`).
- It **verifies by loading the module again** afterwards, so a green result means SQLite really is in use.

To force a rebuild by hand:

```powershell
$pkg = Get-ChildItem node_modules\.pnpm -Directory | Where-Object Name -like 'better-sqlite3@*' | Select-Object -First 1
Push-Location "$($pkg.FullName)\node_modules\better-sqlite3"
$env:npm_config_runtime = 'electron'
$env:npm_config_target  = (Get-Content ..\..\..\..\apps\desktop\node_modules\electron\package.json | ConvertFrom-Json).version
$env:npm_config_disturl = 'https://electronjs.org/headers'
$env:npm_config_arch    = 'x64'
node "C:\Program Files\nodejs\node_modules\npm\node_modules\node-gyp\bin\node-gyp.js" rebuild --release
Pop-Location
```

A plain `pnpm rebuild better-sqlite3` is **not** enough on Windows: with npm 11 the `--runtime`/`--target`/`--build-from-source` flags are no longer forwarded to node-gyp, so the command exits 0 without recompiling anything, and the module stays on Node's ABI. Use the `npm_config_*` environment variables shown above.

## Where the app keeps its data

Everything lives under Electron's per-app `userData` directory — by default `%APPDATA%\<app name>`, i.e. `C:\Users\<you>\AppData\Roaming\<app name>`:

```
<userData>\
  loomnote.db                  notes, imports and settings (SQLite, WAL)
  workspaces\<noteId>\note.md  the note the agent reads and edits
  harness\                     harness home: sessions and loomnote-study.patch.yml
```

When the SQLite module cannot load, the JSON store is written next to it in the same directory.

To move that somewhere else — a fast drive, or a throwaway directory for a demo — set `LOOMNOTE_DATA_DIR` before launching:

```powershell
$env:LOOMNOTE_DATA_DIR = "D:\loomnote-data"
.\scripts\start.ps1
```

**Development credentials.** `config/local.env` is read by `start.ps1` (and by the live harness test) for local runs and is git-ignored. Settings saved in the app — including the model API key — are stored in the local store above, never in the repository.

## See also

- [README.md](../README.md) — requirements and quick start.
- [ARCHITECTURE.md](ARCHITECTURE.md) — what each directory under `userData` is for.
- [TESTING.md](TESTING.md) — running the suite, including the live harness test on Windows.
