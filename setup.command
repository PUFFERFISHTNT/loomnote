#!/usr/bin/env bash
cd "$(dirname "$0")"
./scripts/setup.sh
rc=$?
if [ "$rc" -ne 0 ]; then read -r -p 'Setup failed. Press Enter to close.'; fi
exit "$rc"
