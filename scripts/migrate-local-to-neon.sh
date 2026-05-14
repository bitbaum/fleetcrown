#!/usr/bin/env bash
# Migrate all user data from local Postgres to Neon, rewriting the default
# user_id to the GitHub OAuth user_id found in Neon.
#
# Uses COPY format (binary-safe, fast) and imports in FK dependency order.
# Tables with no rows are skipped. Re-runnable: skips tables already populated.
#
# Usage: ./scripts/migrate-local-to-neon.sh [--dry-run] [--force]
#
# Prerequisites: psql + pg_dump in PATH, local Postgres running

set -euo pipefail

LOCAL_URL="postgresql://cockpit:cockpit_local@127.0.0.1:5432/cockpit"
NEON_URL="postgresql://neondb_owner:npg_ISu3RN0TCikE@ep-bold-shape-al8whvba.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require"

LOCAL_USER_ID="00000000-0000-0000-0000-000000000001"
NEON_USER_ID="b94a359d-4a68-469e-9f8b-8abd254e2106"

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
