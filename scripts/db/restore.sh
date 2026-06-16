#!/usr/bin/env bash
# Restore a pg_dump plain SQL backup produced by scripts/db/dump.sh
#
# Usage:
#   DATABASE_URL=postgresql://... ./scripts/db/restore.sh backup.sql.gz
#
# WARNING: restores into the target database as-is. Prefer an empty DB or
# use --clean manually on a custom dump if you need replace semantics.

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: DATABASE_URL=... $0 <backup.sql.gz>" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [ -z "${DATABASE_URL:-}" ] && [ -f "$ROOT/.env.local" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env.local"
  set +a
fi

URL="${DATABASE_URL:-}"
if [ -z "$URL" ]; then
  echo "ERROR: set DATABASE_URL (direct connection) before running." >&2
  exit 2
fi

BACKUP="$1"
if [ ! -f "$BACKUP" ]; then
  echo "ERROR: file not found: $BACKUP" >&2
  exit 2
fi

echo "Restoring $BACKUP into target database ..."
gunzip -c "$BACKUP" | psql "$URL" -v ON_ERROR_STOP=1
echo "Done."
