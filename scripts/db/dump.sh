#!/usr/bin/env bash
# Logical backup of the FleetCrown database (portable across Postgres hosts).
#
# Usage:
#   DATABASE_URL=postgresql://... ./scripts/db/dump.sh [output.sql.gz]
#
# Defaults DATABASE_URL from .env.local when unset (direct URL preferred).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [ -z "${DATABASE_URL:-}" ] && [ -f "$ROOT/.env.local" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env.local"
  set +a
fi

URL="${DATABASE_URL:-${NEON_DATABASE_URL_DIRECT:-}}"
if [ -z "$URL" ]; then
  echo "ERROR: set DATABASE_URL (direct connection) before running." >&2
  exit 2
fi

OUT="${1:-$ROOT/backups/cockpit-$(date +%Y%m%d-%H%M%S).sql.gz}"
mkdir -p "$(dirname "$OUT")"

echo "Dumping to $OUT ..."
pg_dump "$URL" --no-owner --no-acl --format=plain | gzip > "$OUT"
echo "Done ($(du -h "$OUT" | cut -f1))"
