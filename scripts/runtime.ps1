# Dot-sourced by setup/start. Downloads a verified portable Node when needed.
$ErrorActionPreference = 'Stop'
$LoomNoteRoot = Split-Path -Parent $PSScriptRoot
function Test-LoomNoteNode([string]$Candidate) {
  if (-not $Candidate -or -not (Test-Path -LiteralPath $Candidate)) { return $false }
  try {
    & $Candidate -e 'process.exit(!process.versions.electron && parseInt(process.versions.node) >= 24 ? 0 : 1)' 2>$null
    return ($LASTEXITCODE -eq 0)
  } catch { return $false }
}
$LoomNoteRuntimeNode = $env:LOOMNOTE_NODE
if ($env:LOOMNOTE_PORTABLE_NODE -eq '1') { $LoomNoteRuntimeNode = '' }
if ($env:LOOMNOTE_PORTABLE_NODE -ne '1' -and -not (Test-LoomNoteNode $LoomNoteRuntimeNode)) {
  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  $LoomNoteRuntimeNode = if ($nodeCommand) { $nodeCommand.Source } else { '' }
}
if (-not (Test-LoomNoteNode $LoomNoteRuntimeNode)) {
  $LoomNoteRuntimeNode = Join-Path $LoomNoteRoot '.runtime\node\node.exe'
}
if (-not (Test-LoomNoteNode $LoomNoteRuntimeNode)) {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }
  $temp = Join-Path ([IO.Path]::GetTempPath()) ('loomnote-runtime-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $temp | Out-Null
  try {
    Write-Host 'Preparing Node.js 24 in .runtime/ (no administrator rights needed)...' -ForegroundColor Cyan
    $base = 'https://nodejs.org/dist/latest-v24.x/'
    $checksums = (Invoke-WebRequest -UseBasicParsing -Uri ($base + 'SHASUMS256.txt') -TimeoutSec 120).Content
    $release = [regex]::Match($checksums, "(?m)^([a-f0-9]{64})\s+(node-v24\.\d+\.\d+-win-$arch\.zip)\s*$")
    if (-not $release.Success) { throw 'Could not resolve an official Node.js release.' }
    $archive = Join-Path $temp $release.Groups[2].Value
    Invoke-WebRequest -UseBasicParsing -Uri ($base + $release.Groups[2].Value) -OutFile $archive -TimeoutSec 600
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $release.Groups[1].Value) {
      throw 'Node.js checksum verification failed.'
    }
    Expand-Archive -LiteralPath $archive -DestinationPath $temp
    New-Item -ItemType Directory -Force -Path (Join-Path $LoomNoteRoot '.runtime') | Out-Null
    Move-Item -LiteralPath (Join-Path $temp ([IO.Path]::GetFileNameWithoutExtension($archive))) -Destination (Join-Path $LoomNoteRoot '.runtime\node')
  } finally {
    Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
  }
}
$env:LOOMNOTE_NODE = $LoomNoteRuntimeNode
$env:Path = (Split-Path -Parent $LoomNoteRuntimeNode) + ';' + $env:Path
