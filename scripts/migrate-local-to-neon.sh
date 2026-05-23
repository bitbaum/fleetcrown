#!/usr/bin/env bash
# Backward-compatible wrapper — prefer scripts/db/sync-user-data.sh
exec "$(dirname "$0")/db/sync-user-data.sh" "$@"
