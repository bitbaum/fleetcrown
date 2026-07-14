#!/usr/bin/env bash
# Guarded, forward-only DB schema applier for drizzle apps on the box.
#
# WHY: deploy.sh ships CODE, not SCHEMA. The box's Postgres is reconciled by
# applying drizzle migration SQL. This step applies ONLY migrations not yet
# recorded in public._deploy_schema_history, REFUSES any migration containing a
# destructive statement (so an automated deploy can never silently drop prod
# data), and runs the batch in a single transaction (all-or-nothing).
#
# IDEMPOTENT: drizzle already emits CREATE TABLE/TYPE/INDEX/CONSTRAINT guards;
# we additionally rewrite `ADD COLUMN` -> `ADD COLUMN IF NOT EXISTS`, so an object
# already present (e.g. reconciled earlier via db:push) safely no-ops.
#
# FIRST RUN bootstraps the history table with the CURRENT migration set as an
# already-applied baseline (prod is assumed to be at tip when this is installed)
# and applies nothing. From then on, only genuinely new migrations are applied.
#
# If a future migration MUST be destructive, apply it by hand, then record the
# tag so this step skips it:
#   ssh <box> "sudo -u postgres psql -d <db> \
#     -c \"INSERT INTO public._deploy_schema_history(tag) VALUES ('0040_xxx')\""
#
# Usage: apply-schema.sh <name> <repo> <db>
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

NAME="${1:?usage: apply-schema.sh <name> <repo> <db>}"
REPO="${2:?}"
DB="${3:?}"
MIG_DIR="$REPO/packages/database/drizzle"

[ -d "$MIG_DIR" ] || { echo "[schema] $NAME: no drizzle dir — skipping"; exit 0; }
shopt -s nullglob
MIGS=("$MIG_DIR"/[0-9]*.sql)
[ "${#MIGS[@]}" -gt 0 ] || { echo "[schema] $NAME: no migrations — skipping"; exit 0; }
IFS=$'\n' MIGS=($(sort <<<"${MIGS[*]}")); unset IFS

# Pipe SQL (stdin) to the box's Postgres superuser. Extra psql args via $@.
run_sql() { ssh -o BatchMode=yes "$BOX" "export LC_ALL=C LANG=C; sudo -u postgres psql -d '$DB' -v ON_ERROR_STOP=1 $* -f -"; }

pre_exists=$(printf '%s' "SELECT (to_regclass('public._deploy_schema_history') IS NOT NULL)::int;" | run_sql -qtA)
printf '%s' "CREATE TABLE IF NOT EXISTS public._deploy_schema_history (tag text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());" | run_sql -q

if [ "$pre_exists" != "1" ]; then
  vals=$(printf "('%s')," "${MIGS[@]##*/}"); vals=${vals//.sql/}; vals=${vals%,}
  printf '%s' "INSERT INTO public._deploy_schema_history(tag) VALUES $vals ON CONFLICT DO NOTHING;" | run_sql -q
  echo "[schema] $NAME: first run — baselined ${#MIGS[@]} existing migration(s), applied none"
  exit 0
fi

applied=$(printf '%s' "SELECT tag FROM public._deploy_schema_history;" | run_sql -qtA)

PENDING=()
for f in "${MIGS[@]}"; do
  tag=$(basename "$f" .sql)
  grep -qxF "$tag" <<<"$applied" || PENDING+=("$f")
done
[ "${#PENDING[@]}" -gt 0 ] || { echo "[schema] $NAME: schema up to date (${#MIGS[@]} migration(s))"; exit 0; }

# Guard: refuse the whole deploy if any PENDING migration carries a data-loss or
# table-rewrite statement. Additive drizzle output never does; a hit means the
# schema diff needs a human.
DESTRUCTIVE='DROP TABLE|DROP COLUMN|DROP SCHEMA|TRUNCATE|DELETE[[:space:]]+FROM|ALTER COLUMN[[:space:]].*[[:space:]]TYPE[[:space:]]'
blocked=0
for f in "${PENDING[@]}"; do
  if hits=$(grep -inE "$DESTRUCTIVE" "$f"); then
    echo "[schema] $NAME: REFUSING — destructive statement in $(basename "$f"):"
    sed 's/^/    /' <<<"$hits"
    blocked=1
  fi
done
if [ "$blocked" = 1 ]; then
  echo "[schema] $NAME: apply the above by hand, then record the tag(s) in"
  echo "         public._deploy_schema_history so this step skips them. Deploy aborted."
  exit 1
fi

# Build one idempotent, transactional batch and record each tag on success.
BATCH=$(mktemp); trap 'rm -f "$BATCH"' EXIT
{
  echo "BEGIN;"
  for f in "${PENDING[@]}"; do
    tag=$(basename "$f" .sql)
    echo "-- ===== $tag ====="
    sed -e 's/--> statement-breakpoint//g' -e 's/ADD COLUMN "/ADD COLUMN IF NOT EXISTS "/g' "$f"
    echo "INSERT INTO public._deploy_schema_history(tag) VALUES ('$tag') ON CONFLICT DO NOTHING;"
  done
  echo "COMMIT;"
} > "$BATCH"

pending_names=$(printf '%s ' "${PENDING[@]##*/}")
echo "[schema] $NAME: applying ${#PENDING[@]} migration(s): $pending_names"
run_sql -q < "$BATCH"
echo "[schema] $NAME: schema applied ✓"
