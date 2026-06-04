#!/usr/bin/env bash
# Dump the FleetCrown production database from Neon to a portable SQL file
# that can be restored anywhere a Postgres 17 server is running.
#
# Usage:
#   SOURCE_DATABASE_URL="postgresql://..." scripts/db/dump-from-neon.sh
#
# Output: ./neon-dump-<timestamp>.sql + a manifest with row counts so the
# restore script can verify nothing was silently dropped.
#
# Why a flat SQL dump instead of pg_dump's custom format:
#   - We want to read it (eyeball schema, redact secrets in row data).
#   - Custom format requires pg_restore (still pg, but one extra step).
#   - SQL plays nicer with diff-tools when comparing pre/post-migration state.
#
# Why no --schema-only fallback by default: the data IS the migration. If
# you just want schema, run `pg_dump --schema-only ...` directly.
#
# Quota note (2026-06): Neon free tier's data transfer cap blocked pg_dump
# entirely once it tripped. If this script fails with "Your project has
# exceeded the data transfer quota," you must either upgrade the plan or
# wait for the monthly reset before this works.

set -euo pipefail

if [[ -z "${SOURCE_DATABASE_URL:-}" ]]; then
  echo "error: SOURCE_DATABASE_URL not set" >&2
  echo "usage: SOURCE_DATABASE_URL='postgresql://...' $0" >&2
  exit 64
fi

STAMP=$(date -u +%Y%m%d-%H%M%S)
OUT="neon-dump-${STAMP}.sql"
MANIFEST="neon-dump-${STAMP}.manifest.txt"

echo "==> dumping schema + data to ${OUT}"
pg_dump \
  --no-owner \
  --no-acl \
  --no-tablespaces \
  --format=plain \
  --quote-all-identifiers \
  --file="${OUT}" \
  "${SOURCE_DATABASE_URL}"

SIZE=$(stat -c %s "${OUT}" 2>/dev/null || stat -f %z "${OUT}" 2>/dev/null)
echo "    dump size: ${SIZE} bytes"

echo "==> writing manifest to ${MANIFEST}"
{
  echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Source host: $(echo "${SOURCE_DATABASE_URL}" | sed 's|.*@||; s|/.*||')"
  echo "Dump file: ${OUT}"
  echo "Dump size: ${SIZE} bytes"
  echo
  echo "Row counts (for post-restore verification):"
  psql "${SOURCE_DATABASE_URL}" -tAc "
    SELECT schemaname || '.' || relname || ' ' || n_live_tup
    FROM pg_stat_user_tables
    ORDER BY relname
  " | sed 's/^/  /'
} > "${MANIFEST}"

echo
echo "==> done"
echo "    ${OUT}"
echo "    ${MANIFEST}"
echo
echo "Next: scripts/db/restore-to-target.sh"
