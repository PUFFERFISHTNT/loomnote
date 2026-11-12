#!/usr/bin/env bash
# Sourced by the macOS/Linux launchers. A missing Node is installed locally.
set -euo pipefail
LOOMNOTE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

loomnote_node_ok() {
  [ -x "$1" ] && "$1" -e 'process.exit(!process.versions.electron && Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)' >/dev/null 2>&1
}

LOOMNOTE_RUNTIME_NODE="${LOOMNOTE_NODE:-}"
if [ "${LOOMNOTE_PORTABLE_NODE:-}" = 1 ]; then LOOMNOTE_RUNTIME_NODE=''; fi
if [ "${LOOMNOTE_PORTABLE_NODE:-}" != 1 ] && ! loomnote_node_ok "$LOOMNOTE_RUNTIME_NODE"; then
  LOOMNOTE_RUNTIME_NODE="$(command -v node || true)"
fi
if ! loomnote_node_ok "$LOOMNOTE_RUNTIME_NODE"; then
  LOOMNOTE_RUNTIME_NODE="$LOOMNOTE_ROOT/.runtime/node/bin/node"
fi
if ! loomnote_node_ok "$LOOMNOTE_RUNTIME_NODE"; then
  case "$(uname -s)" in Darwin) runtime_os=darwin ;; Linux) runtime_os=linux ;; *) echo 'Unsupported platform.' >&2; exit 1 ;; esac
  case "$(uname -m)" in arm64|aarch64) runtime_arch=arm64 ;; x86_64|amd64) runtime_arch=x64 ;; *) echo 'Unsupported CPU architecture.' >&2; exit 1 ;; esac
  command -v curl >/dev/null || { echo 'curl is needed to download Node.js.' >&2; exit 1; }
  runtime_temp="$(mktemp -d "${TMPDIR:-/tmp}/loomnote-runtime.XXXXXX")"
  echo 'Preparing Node.js 24 in .runtime/ (no system installation)...'
  curl --fail --location --retry 2 --connect-timeout 20 --max-time 300 --silent --show-error \
    https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "$runtime_temp/checksums"
  runtime_file="$(awk -v suffix="-$runtime_os-$runtime_arch.tar.gz" '$2 ~ (suffix "$") {print $2; exit}' "$runtime_temp/checksums")"
  [[ "$runtime_file" =~ ^node-v24\.[0-9]+\.[0-9]+- ]] || { echo 'Could not resolve an official Node.js release.' >&2; exit 1; }
  curl --fail --location --retry 2 --connect-timeout 20 --max-time 600 --silent --show-error \
    "https://nodejs.org/dist/latest-v24.x/$runtime_file" -o "$runtime_temp/$runtime_file"
  runtime_expected="$(awk -v file="$runtime_file" '$2 == file {print $1}' "$runtime_temp/checksums")"
  if command -v shasum >/dev/null; then
    runtime_actual="$(shasum -a 256 "$runtime_temp/$runtime_file" | awk '{print $1}')"
  else
    runtime_actual="$(sha256sum "$runtime_temp/$runtime_file" | awk '{print $1}')"
  fi
  [ "$runtime_actual" = "$runtime_expected" ] || { echo 'Node.js checksum verification failed.' >&2; exit 1; }
  tar -xzf "$runtime_temp/$runtime_file" -C "$runtime_temp"
  mkdir -p "$LOOMNOTE_ROOT/.runtime"
  mv "$runtime_temp/${runtime_file%.tar.gz}" "$LOOMNOTE_ROOT/.runtime/node"
  rm -rf "$runtime_temp"
fi
export LOOMNOTE_NODE="$LOOMNOTE_RUNTIME_NODE"
export PATH="$(dirname "$LOOMNOTE_RUNTIME_NODE"):$PATH"
