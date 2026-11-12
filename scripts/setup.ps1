$ErrorActionPreference = 'Stop'
try {
  . (Join-Path $PSScriptRoot 'runtime.ps1')
  & $LoomNoteRuntimeNode (Join-Path $LoomNoteRoot 'scripts\launch.mjs') --setup
  exit $LASTEXITCODE
} catch {
  Write-Host "LoomNote could not start: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
