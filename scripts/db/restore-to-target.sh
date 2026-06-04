#!/usr/bin/env bash
# Restore a Neon dump (from scripts/db/dump-from-neon.sh) into a target
# Postgres 17 host. Verifies row counts against the manifest so silent
# drops don't make it to "go live."
#
# Usage:
#   TARGET_DATABASE_URL="postgresql://..." \
#   DUMP_FILE="neon-dump-20260604-103000.sql" \
#   MANIFEST_FILE="neon-dump-20260604-103000.manifest.txt" \
#   scripts/db/restore-to-target.sh
#
# Pre-flight:
#   - target DB is empty (or `RECREATE_DB=1` to drop + recreate it)
#   - psql 17 client available
#   - network reachable to the target host
#
# Post-restore: prints a row-count comparison vs the source manifest.
# Mismatches halt the script before you flip Vercel env DATABASE_URL.

set -euo pipefail

if [[ -z "${TARGET_DATABASE_URL:-}" || -z "${DUMP_FILE:-}" ]]; then
  echo "error: TARGET_DATABASE_URL + DUMP_FILE required" >&2
  echo "usage: TARGET_DATABASE_URL='...' DUMP_FILE='...' [MANIFEST_FILE='...'] $0" >&2
  exit 64
fi

if [[ ! -f "${DUMP_FILE}" ]]; then
  echo "error: dump file not found: ${DUMP_FILE}" >&2
  exit 66
fi

# Default manifest path = dump path with .manifest.txt suffix
MANIFEST_FILE="${MANIFEST_FILE:-${DUMP_FILE%.sql}.manifest.txt}"

TARGET_HOST=$(echo "${TARGET_DATABASE_URL}" | sed 's|.*@||; s|/.*||')
TARGET_DB=$(echo "${TARGET_DATABASE_URL}" | sed 's|^.*/||; s|?.*||')

echo "==> target: ${TARGET_HOST} / ${TARGET_DB}"
echo "==> dump: ${DUMP_FILE} ($(stat -c %s "${DUMP_FILE}" 2>/dev/null || stat -f %z "${DUMP_FILE}" 2>/dev/null) bytes)"

# Optional recreate — handy for retries during a migration dress rehearsal.
if [[ "${RECREATE_DB:-}" = "1" ]]; then
  TARGET_ADMIN_URL="${TARGET_DATABASE_URL%/${TARGET_DB}*}/postgres"
  echo "==> RECREATE_DB=1 → dropping and recreating ${TARGET_DB}"
  psql "${TARGET_ADMIN_URL}" -c "DROP DATABASE IF EXISTS \"${TARGET_DB}\";"
  psql "${TARGET_ADMIN_URL}" -c "CREATE DATABASE \"${TARGET_DB}\";"
fi

# Pre-flight: confirm the target is empty enough. We refuse to overwrite a
# DB that already has FleetCrown's `users` table populated — too risky.
EXISTING_USERS=$(psql "${TARGET_DATABASE_URL}" -tAc "
  SELECT COALESCE((SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='users'), 0)
" 2>/dev/null || echo "0")
EXISTING_USER_ROWS=0
if [[ "${EXISTING_USERS}" -gt 0 ]]; then
  EXISTING_USER_ROWS=$(psql "${TARGET_DATABASE_URL}" -tAc "SELECT count(*) FROM users" 2>/dev/null || echo "0")
fi
if [[ "${EXISTING_USER_ROWS}" -gt 0 ]] && [[ "${RECREATE_DB:-}" != "1" ]]; then
  echo "error: target already has ${EXISTING_USER_ROWS} user(s). Refusing to overwrite." >&2
  echo "       Set RECREATE_DB=1 to drop and recreate the database first." >&2
  exit 65
fi

echo "==> restoring (this can take a while for large dumps)"
psql "${TARGET_DATABASE_URL}" --quiet --single-transaction --set ON_ERROR_STOP=on -f "${DUMP_FILE}"
echo "    restore complete"

echo
echo "==> row-count verification"
if [[ ! -f "${MANIFEST_FILE}" ]]; then
  echo "warning: manifest ${MANIFEST_FILE} not found — skipping comparison" >&2
else
  TMP=$(mktemp)
  psql "${TARGET_DATABASE_URL}" -tAc "
    SELECT schemaname || '.' || relname || ' ' || n_live_tup
    FROM pg_stat_user_tables
    ORDER BY relname
  " > "${TMP}"
  # Compare each line in manifest against actual counts
  MISMATCHES=0
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    [[ "$line" =~ ^[[:space:]] ]] || continue
    line="${line# }"
    line="${line# }"
    [[ -z "$line" ]] && continue
    expected_table=$(echo "$line" | awk '{print $1}')
    expected_count=$(echo "$line" | awk '{print $2}')
    actual=$(grep "^${expected_table} " "${TMP}" | awk '{print $2}' || echo "MISSING")
    if [[ "$actual" != "$expected_count" ]]; then
      echo "  MISMATCH ${expected_table}: source=${expected_count} target=${actual}"
      MISMATCHES=$((MISMATCHES + 1))
    fi
  done < "${MANIFEST_FILE}"
  rm -f "${TMP}"
  if [[ "$MISMATCHES" -gt 0 ]]; then
    echo "error: ${MISMATCHES} table(s) have mismatched row counts. Do NOT flip Vercel env yet." >&2
    exit 1
  fi
  echo "    all row counts match"
fi

echo
echo "==> done"
echo
echo "Next steps:"
echo "  1. vercel env rm DATABASE_URL production  (or add a new one)"
echo "  2. vercel env add DATABASE_URL production  → paste new URL"
echo "  3. vercel --prod --yes  → fresh deploy"
echo "  4. curl https://fleetcrown.vercel.app/api/health → expect 200 with runtime info"
echo "  5. dogfood /control, /settings, /system in the browser"
