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
# Usage: apply-schema.sh <name> <repo> <db> [app_dir]
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

NAME="${1:?usage: apply-schema.sh <name> <repo> <db> [app_dir]}"
REPO="${2:?}"
DB="${3:?}"
APP_DIR="${4:-.}"

# Resolve the migrations dir per app layout. The original hardcoded kivvi's
# monorepo path, so every OTHER drizzle app silently skipped this step and
# deploys shipped code without schema ("no drizzle dir — skipping" looked
# benign in logs). Probe the known layouts, first dir with numbered .sql wins:
#   packages/database/drizzle      kivvi (monorepo)
#   <app_dir>/drizzle              vitareba, petvity, surf-your-life (root apps)
#   <app_dir>/src/lib/db/migrations  revamp-info
shopt -s nullglob
MIG_DIR=""
for cand in \
  "$REPO/packages/database/drizzle" \
  "$REPO/$APP_DIR/drizzle" \
  "$REPO/$APP_DIR/src/lib/db/migrations" \
  "$REPO/drizzle" \
  "$REPO/src/lib/db/migrations"; do
  probe=("$cand"/[0-9]*.sql)
  [ "${#probe[@]}" -gt 0 ] && { MIG_DIR="$cand"; break; }
done
# Prisma apps: no drizzle dir, but prisma/migrations exists → use Prisma's own
# forward-only applier (its _prisma_migrations history table, native guardrails).
# Needs DATABASE_URL (deploy.sh calls us with it tunneled to the box); a
# standalone invocation without it skips with a warning rather than guessing.
if [ -z "$MIG_DIR" ] && [ -d "$REPO/$APP_DIR/prisma/migrations" ]; then
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "[schema] $NAME: prisma app but DATABASE_URL unset (standalone run?) — skipping"
    exit 0
  fi
  echo "[schema] $NAME: prisma migrate deploy"
  (cd "$REPO/$APP_DIR" && npx prisma migrate deploy) \
    || { echo "[schema] $NAME: prisma migrate deploy FAILED"; exit 1; }
  echo "[schema] $NAME: schema applied ✓ (prisma)"
  exit 0
fi

# Supabase-layout apps (orangecat: 39 migrations, botsmann: 11) keep their SQL
# in supabase/migrations. They were skipped for years with a friendly "no
# migrations found" and exit 0, which reads as "nothing to apply" — a green
# deploy of code written against a schema nobody applied.
#
# They cannot use the host psql the drizzle path uses. Their database lives
# INSIDE the supabase-db container and that container publishes no port
# (`docker port supabase-db` is empty), so `psql -d <app>` on the host reaches
# a different database entirely. Measured 2026-08-26: the host has a database
# called `orangecat` with ZERO tables, while the container's `postgres` holds
# the real 134. Pointing the applier at the host would have baselined an empty
# database, reported success, and then "applied" every future migration
# somewhere nothing reads — strictly worse than skipping.
#
# So supabase apps get the same ledger, the same destructive guard and the same
# transactional batch, over `docker exec` instead of host psql.
SQL_TARGET="host"
if [ -z "$MIG_DIR" ]; then
  for cand in "$REPO/$APP_DIR/supabase/migrations" "$REPO/supabase/migrations"; do
    probe=("$cand"/[0-9]*.sql)
    [ "${#probe[@]}" -gt 0 ] && { MIG_DIR="$cand"; SQL_TARGET="supabase"; break; }
  done
fi

if [ "$SQL_TARGET" = "supabase" ] \
   && ! ssh -o BatchMode=yes "$BOX" 'sudo docker ps --format "{{.Names}}" | grep -qx supabase-db'; then
  msg="$NAME: migrations in ${MIG_DIR#"$REPO"/} need the supabase-db container, which is not running on the box — NOT applied"
  echo "[schema] $msg"
  [ -n "${GITHUB_ACTIONS:-}" ] && echo "::warning title=Schema not applied::$msg"
  exit 0
fi

[ -n "$MIG_DIR" ] || { echo "[schema] $NAME: no migrations found (drizzle, prisma or supabase) — skipping (generate a baseline first)"; exit 0; }
MIGS=("$MIG_DIR"/[0-9]*.sql)
[ "${#MIGS[@]}" -gt 0 ] || { echo "[schema] $NAME: no migrations — skipping"; exit 0; }
IFS=$'\n' MIGS=($(sort <<<"${MIGS[*]}")); unset IFS

# Pipe SQL (stdin) to the box's Postgres superuser. Extra psql args via $@.
run_sql() {
  if [ "$SQL_TARGET" = "supabase" ]; then
    # -i so the heredoc/stdin reaches psql inside the container.
    ssh -o BatchMode=yes "$BOX" "export LC_ALL=C LANG=C; sudo docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 $* -f -"
  else
    ssh -o BatchMode=yes "$BOX" "export LC_ALL=C LANG=C; sudo -u postgres psql -d '$DB' -v ON_ERROR_STOP=1 $* -f -"
  fi
}

# Baselining marks every existing migration as already applied WITHOUT running
# them. On a genuinely fresh database that is wrong but harmless (there is
# nothing to baseline). On a populated one it is an assertion nobody checked:
# "everything in this repo is already in this database". If that assertion is
# false the missing objects never get created and the ledger reports "up to
# date" forever.
#
# Two ways to get that wrong, both observed on 2026-08-26:
#
#   * WRONG DATABASE. The box has a host database named `orangecat` with zero
#     tables while the real one lives inside the supabase-db container. An
#     empty database sharing an app's name looks exactly like a fresh install.
#
#   * SHARED DATABASE. orangecat and botsmann use the SAME supabase database.
#     It holds 134 tables, so any "is there anything here?" test passes — while
#     none of botsmann's own tables exist in it. Table count says nothing about
#     whether THIS app's schema was applied, and no cheap test does.
#
# So the automatic path is the safe one only: an empty database gets its
# migrations APPLIED, not baselined. Baselining a populated database is a
# judgement about what is already there, and it now requires a human to say so
# with SCHEMA_BASELINE_OK=1 after checking.
guard_baseline() {
  local tables
  tables=$(printf '%s' "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" | run_sql -qtA)
  if [ "${tables:-0}" -lt 2 ]; then
    BASELINE_MODE="apply"   # fresh database — run them for real
    return
  fi
  if [ "${SCHEMA_BASELINE_OK:-}" = "1" ]; then
    BASELINE_MODE="baseline"
    echo "[schema] $NAME: SCHEMA_BASELINE_OK=1 — trusting that ${#MIGS[@]} migration(s) are already applied"
    return
  fi
  echo "[schema] $NAME: REFUSING — no ledger yet, and the target database already has ${tables} table(s)."
  echo "         Baselining would record ${#MIGS[@]} migration(s) as applied without running them."
  echo "         Check whether THIS app's objects actually exist (a shared database has other"
  echo "         apps' tables in it), then re-run with SCHEMA_BASELINE_OK=1. Deploy aborted."
  exit 1
}

pre_exists=$(printf '%s' "SELECT (to_regclass('public._deploy_schema_history') IS NOT NULL)::int;" | run_sql -qtA)
printf '%s' "CREATE TABLE IF NOT EXISTS public._deploy_schema_history (tag text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());" | run_sql -q

if [ "$pre_exists" != "1" ]; then
  guard_baseline
  if [ "$BASELINE_MODE" = "baseline" ]; then
    vals=$(printf "('%s')," "${MIGS[@]##*/}"); vals=${vals//.sql/}; vals=${vals%,}
    printf '%s' "INSERT INTO public._deploy_schema_history(tag) VALUES $vals ON CONFLICT DO NOTHING;" | run_sql -q
    echo "[schema] $NAME: first run — baselined ${#MIGS[@]} existing migration(s), applied none"
    exit 0
  fi
  # BASELINE_MODE=apply — empty database, so fall through and run them all.
  echo "[schema] $NAME: first run against an empty database — applying ${#MIGS[@]} migration(s)"
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
