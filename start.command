#!/usr/bin/env bash
cd "$(dirname "$0")"
./scripts/start.sh "$@"
rc=$?
if [ "$rc" -ne 0 ]; then read -r -p 'Startup failed. Press Enter to close.'; fi
exit "$rc"
