#!/usr/bin/env bash
# Dump the OrangeCat production database from Supabase to a portable SQL
# file. Companion to dump-from-neon.sh; same output shape, same manifest
# format, restore-to-target.sh accepts either.
#
# Usage (from inside the orangecat repo, or anywhere with the URL set):
#   SOURCE_DATABASE_URL="postgresql://postgres:[password]@db.<ref>.supabase.co:5432/postgres" \
#     scripts/db/dump-from-supabase.sh
#
# Supabase-specific notes:
#   - Use the DIRECT connection URL (port 5432), NOT the pooler URL
#     (port 6543). pg_dump doesn't play well with PgBouncer's transaction
#     pooling mode.
#   - By default we dump ONLY the public schema. Supabase reserves
#     `auth`, `storage`, `realtime`, `extensions`, `graphql`, `vault`,
#     etc. for its own components. Those tables come back when you
#     restore Supabase Auth / Storage separately (or when you self-host
#     gotrue). Including them in a vanilla-Postgres restore creates
#     foreign-key errors against missing roles.
#   - If you want EVERYTHING (because you're self-hosting gotrue too),
#     set FULL_DUMP=1 and the script switches to a no-filter dump.
#
# Output: ./supabase-dump-<timestamp>.sql + .manifest.txt

set -euo pipefail

if [[ -z "${SOURCE_DATABASE_URL:-}" ]]; then
  echo "error: SOURCE_DATABASE_URL not set" >&2
  echo "usage: SOURCE_DATABASE_URL='postgresql://postgres:...@db.X.supabase.co:5432/postgres' $0" >&2
  echo "       (use the direct connection URL — port 5432, NOT pooler port 6543)" >&2
  exit 64
fi

# Refuse pooler URLs — pg_dump on the pooler gets stuck in transaction
# pooling mode and fails midway.
if [[ "${SOURCE_DATABASE_URL}" == *":6543/"* ]] || [[ "${SOURCE_DATABASE_URL}" == *"pooler.supabase"* ]]; then
  echo "error: SOURCE_DATABASE_URL points at the Supabase pooler (port 6543 or pooler.supabase.com)" >&2
  echo "       pg_dump needs the direct connection. Find it in:" >&2
  echo "       Supabase dashboard → Settings → Database → Connection string → 'Direct connection'" >&2
  exit 64
fi

STAMP=$(date -u +%Y%m%d-%H%M%S)
OUT="supabase-dump-${STAMP}.sql"
MANIFEST="supabase-dump-${STAMP}.manifest.txt"

if [[ "${FULL_DUMP:-}" = "1" ]]; then
  echo "==> FULL_DUMP=1 → dumping all schemas (including auth/storage/etc.)"
  echo "    Restore requires the matching Supabase roles to exist on the target."
  pg_dump \
    --no-owner --no-acl --no-tablespaces \
    --format=plain --quote-all-identifiers \
    --file="${OUT}" "${SOURCE_DATABASE_URL}"
else
  echo "==> dumping public schema only (vanilla-Postgres-restorable)"
  echo "    Auth/storage stay on Supabase. Set FULL_DUMP=1 to dump everything."
  pg_dump \
    --no-owner --no-acl --no-tablespaces \
    --schema=public \
    --format=plain --quote-all-identifiers \
    --file="${OUT}" "${SOURCE_DATABASE_URL}"
fi

SIZE=$(stat -c %s "${OUT}" 2>/dev/null || stat -f %z "${OUT}" 2>/dev/null)
echo "    dump size: ${SIZE} bytes"

echo "==> writing manifest to ${MANIFEST}"
{
  echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Source host: $(echo "${SOURCE_DATABASE_URL}" | sed 's|.*@||; s|/.*||')"
  echo "Source product: OrangeCat (Supabase)"
  echo "Dump mode: ${FULL_DUMP:+all schemas}${FULL_DUMP:-public schema only}"
  echo "Dump file: ${OUT}"
  echo "Dump size: ${SIZE} bytes"
  echo
  echo "Row counts (for post-restore verification):"
  psql "${SOURCE_DATABASE_URL}" -tAc "
    SELECT schemaname || '.' || relname || ' ' || n_live_tup
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    ORDER BY relname
  " | sed 's/^/  /'
} > "${MANIFEST}"

echo
echo "==> done"
echo "    ${OUT}"
echo "    ${MANIFEST}"
echo
echo "Next: scripts/db/restore-to-target.sh (any product, same script)"
