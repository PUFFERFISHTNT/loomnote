#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/runtime.sh"
exec "$LOOMNOTE_NODE" "$LOOMNOTE_ROOT/scripts/launch.mjs" "$@"
