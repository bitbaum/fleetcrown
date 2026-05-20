#!/usr/bin/env bash
# Migrate all user data from local Postgres to Neon, rewriting the default
# user_id to the GitHub OAuth user_id found in Neon.
#
# Uses COPY format (binary-safe, fast) and imports in FK dependency order.
# Tables with no rows are skipped. Re-runnable: skips tables already populated.
#
# Usage:
#   LOCAL_DATABASE_URL=... NEON_DATABASE_URL=... NEON_USER_ID=<uuid> \
#     ./scripts/migrate-local-to-neon.sh [--dry-run] [--force]
#
# Env vars:
#   LOCAL_DATABASE_URL   Source (defaults to local cockpit Postgres on 5432)
#   NEON_DATABASE_URL    Target (also accepts NEON_DATABASE_URL_DIRECT — same
#                        resolution as drizzle.config.ts). REQUIRED.
#   LOCAL_USER_ID        Source user_id to rewrite (defaults to the dev seed
#                        UUID 00000000-0000-0000-0000-000000000001).
#   NEON_USER_ID         Target user_id (the GitHub OAuth row in Neon). REQUIRED.
#
# Prerequisites: psql + pg_dump in PATH, local Postgres running.
#
# Security note: NEVER hardcode connection strings here. Prior versions of
# this file leaked the Neon password into git history; rotate the password
# on Neon if you pulled this repo before the refactor that removed it.

set -euo pipefail

LOCAL_URL="${LOCAL_DATABASE_URL:-postgresql://cockpit:cockpit_local@127.0.0.1:5432/cockpit}"
NEON_URL="${NEON_DATABASE_URL:-${NEON_DATABASE_URL_DIRECT:-}}"
LOCAL_USER_ID="${LOCAL_USER_ID:-00000000-0000-0000-0000-000000000001}"

if [ -z "$NEON_URL" ]; then
  echo "ERROR: set NEON_DATABASE_URL (or NEON_DATABASE_URL_DIRECT) before running." >&2
  echo "Get one via: neonctl connection-string --project-id <id> --pooled false" >&2
  exit 2
fi

if [ -z "${NEON_USER_ID:-}" ]; then
  echo "ERROR: set NEON_USER_ID to the target user's UUID in Neon." >&2
  echo "Find it via: psql \"\$NEON_DATABASE_URL\" -c \"SELECT id, email FROM users\"" >&2
  exit 2
fi

DRY_RUN=false
FORCE=false
for arg in "$@"; do
  [[ "$arg" == "--dry-run" ]] && DRY_RUN=true
  [[ "$arg" == "--force" ]]   && FORCE=true
done

echo "=== Local → Neon data migration ==="
echo "  Local user_id : $LOCAL_USER_ID"
echo "  Neon  user_id : $NEON_USER_ID"
$DRY_RUN && echo "  MODE: DRY RUN (no writes to Neon)"
echo ""

# Tables in FK-safe import order (parents before children)
TABLES=(
  entities
  attributes
  entity_relations
  interactions
  alerts
  user_projects
  goals
  subscriptions
  commitments
  events
  actions
  habits
  habit_completions
  orchestration_runs
  orchestration_events
  project_states
  prompt_history
  pending_commands
)

# Verify Neon reachable and user exists
echo "Verifying Neon connection..."
NEON_USER_COUNT=$(psql "$NEON_URL" -t -c "SELECT count(*) FROM users;" 2>/dev/null | tr -d ' \n')
[[ -z "$NEON_USER_COUNT" || "$NEON_USER_COUNT" == "0" ]] && { echo "ERROR: Neon users table empty or unreachable."; exit 1; }
echo "  Neon users: $NEON_USER_COUNT ✓"

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

IMPORTED=0
SKIPPED=0

for t in "${TABLES[@]}"; do
  LOCAL_COUNT=$(psql "$LOCAL_URL" -t -c "SELECT count(*) FROM $t;" 2>/dev/null | tr -d ' \n')
  NEON_COUNT=$(psql "$NEON_URL"  -t -c "SELECT count(*) FROM $t;" 2>/dev/null | tr -d ' \n')

  if [[ "$LOCAL_COUNT" == "0" ]]; then
    echo "  $t: 0 rows — skip"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  if [[ "$NEON_COUNT" != "0" && "$FORCE" == "false" ]]; then
    echo "  $t: already has $NEON_COUNT rows — skip (--force to overwrite)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  echo -n "  $t: $LOCAL_COUNT rows — "

  COPY_FILE="$TMPDIR/${t}.copy"

  # Extract COPY data from pg_dump (between COPY header and \. terminator)
  pg_dump "$LOCAL_URL" \
    --table="$t" \
    --data-only \
    --no-comments \
    --no-owner \
    --no-privileges \
    2>/dev/null \
  | awk '/^COPY /,/^\\./' \
  | sed "s/$LOCAL_USER_ID/$NEON_USER_ID/g" \
  > "$COPY_FILE"

  if $DRY_RUN; then
    echo "would import (dry run)"
    head -3 "$COPY_FILE"
    continue
  fi

  if [[ "$NEON_COUNT" != "0" && "$FORCE" == "true" ]]; then
    psql "$NEON_URL" -c "TRUNCATE TABLE $t CASCADE;" 2>/dev/null
  fi

  # Feed COPY data into Neon
  RESULT=$(psql "$NEON_URL" -f "$COPY_FILE" 2>&1)
  if echo "$RESULT" | grep -q "^COPY"; then
    ROWS=$(echo "$RESULT" | grep "^COPY" | awk '{print $2}')
    echo "imported $ROWS rows ✓"
    IMPORTED=$((IMPORTED + 1))
  else
    echo "ERROR"
    echo "$RESULT" | head -5
  fi
done

echo ""
echo "=== Verification ==="
psql "$NEON_URL" -c "
SELECT 'entities' as t, count(*) FROM entities
UNION ALL SELECT 'user_projects', count(*) FROM user_projects
UNION ALL SELECT 'goals', count(*) FROM goals
UNION ALL SELECT 'subscriptions', count(*) FROM subscriptions
UNION ALL SELECT 'commitments', count(*) FROM commitments
UNION ALL SELECT 'events', count(*) FROM events
UNION ALL SELECT 'interactions', count(*) FROM interactions
UNION ALL SELECT 'prompt_history', count(*) FROM prompt_history
UNION ALL SELECT 'orchestration_events', count(*) FROM orchestration_events
ORDER BY t;" 2>/dev/null

echo ""
echo "Done: $IMPORTED tables imported, $SKIPPED skipped."
