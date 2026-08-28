#!/usr/bin/env bash
# Guarded, forward-only DB schema applier for drizzle apps on the box.
#
# WHY: deploy.sh ships CODE, not SCHEMA. The box's Postgres is reconciled by
# applying drizzle migration SQL. This step applies ONLY migrations not yet
# recorded in the app's _deploy_schema_history ledger, REFUSES any migration
# containing a
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
# tag so this step skips it. Note the ledger is named after the app's SCHEMA,
# which is `public` only for apps that own their database outright:
#   ssh <box> "sudo -u postgres psql -d <db> \
#     -c \"INSERT INTO <schema>._deploy_schema_history(tag) VALUES ('0040_xxx')\""
#
# Usage: apply-schema.sh <name> <repo> <db> [app_dir]
#   <db>  host database name | supabase:<schema> | '-' (caller skips us)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

NAME="${1:?usage: apply-schema.sh <name> <repo> <db> [app_dir]}"
REPO="${2:?}"
DB="${3:?}"
APP_DIR="${4:-.}"

# A supabase-container app declares `supabase:<schema>` in the manifest's db
# field; everything else names a host Postgres database exactly as before.
#
# WHY a schema at all: ONE supabase database backs several apps. orangecat owns
# `public` and its 128 tables. Applying a second app's migrations there is not
# merely untidy, it is destructive — botsmann's 001 defines
# `CREATE OR REPLACE FUNCTION update_updated_at()`, a name public ALREADY holds,
# so the apply would silently redefine the function orangecat's triggers call.
# Table names collide too (`conversations`, `documents`, `waitlist`).
# So each such app gets its own schema, exactly as printcraft already has one.
# schema_from_db <db> — echo the schema this app owns, or fail loudly.
# Pure: no box, no network. Tested by test-apply-schema.sh.
schema_from_db() {
  case "$1" in
    supabase:*)
      local sch="${1#supabase:}"
      [ -n "$sch" ] || { echo "db is 'supabase:' with no schema name" >&2; return 1; }
      case "$sch" in
        *[!a-z0-9_]*) echo "bad schema name '$sch' (want [a-z0-9_])" >&2; return 1;;
        pg_*)         echo "schema '$sch' is reserved by Postgres" >&2; return 1;;
        public)       echo "'supabase:public' would put this app in orangecat's schema" >&2; return 1;;
      esac
      printf '%s' "$sch"
      ;;
    *) printf 'public' ;;
  esac
}

# strip_bodies <file> — echo the file with dollar-quoted bodies blanked, line
# numbers preserved. Pure. Used by the destructive-statement guard below, and
# tested by test-apply-schema.sh.
strip_bodies() {
  awk '
    { line = $0; was_in = in_body
      n = gsub(/\$[A-Za-z_0-9]*\$/, "&", line)
      if (n % 2 == 1) in_body = !in_body
      print was_in ? "" : $0 }
  ' "$1"
}

# ledger_for <schema> — the ledger lives beside the tables it describes. A
# shared `public` ledger would mix two apps' tags in one namespace and make
# "up to date" meaningless for both.
ledger_for() { printf '%s._deploy_schema_history' "$1"; }

TARGET_SCHEMA=$(schema_from_db "$DB") \
  || { echo "[schema] $NAME: bad db field '$DB'"; exit 1; }
[ "$TARGET_SCHEMA" = "public" ] || DECLARED_SUPABASE=1
LEDGER=$(ledger_for "$TARGET_SCHEMA")

# Sourced by test-apply-schema.sh to exercise the pure helpers above without a
# box, a database or a checkout.
# migration_dirs <layout> <repo> <app_dir> — every directory this applier looks
# in for that layout, in the order it looks.
#
# Pure, and deliberately ABOVE the lib-only return, because TWO things must
# agree about where migrations live: this applier, and the deploy-ready gate
# that fails a build when an app ships migrations while declaring `db=-`.
# botsmann and printcraft both did exactly that; the pipeline never saw a single
# file and both shipped green for months. A gate carrying its own copy of this
# list would drift from the applier and start lying in the other direction —
# so there is one list, and this is it.
migration_dirs() {
  local layout="$1" repo="$2" app_dir="${3:-.}"
  case "$layout" in
    drizzle)
      printf '%s\n' \
        "$repo/packages/database/drizzle" \
        "$repo/$app_dir/drizzle" \
        "$repo/$app_dir/src/lib/db/migrations" \
        "$repo/drizzle" \
        "$repo/src/lib/db/migrations" ;;
    prisma)
      printf '%s\n' "$repo/$app_dir/prisma/migrations" ;;
    supabase)
      printf '%s\n' "$repo/$app_dir/supabase/migrations" "$repo/supabase/migrations" ;;
    *) return 1 ;;
  esac
}

if [ -n "${APPLY_SCHEMA_LIB_ONLY:-}" ]; then return 0; fi

# Resolve the migrations dir per app layout. The original hardcoded kivvi's
# monorepo path, so every OTHER drizzle app silently skipped this step and
# deploys shipped code without schema ("no drizzle dir — skipping" looked
# benign in logs). Probe the known layouts, first dir with numbered .sql wins:
#   packages/database/drizzle      kivvi (monorepo)
#   <app_dir>/drizzle              vitareba, petvity, surf-your-life (root apps)
#   <app_dir>/src/lib/db/migrations  revamp-info
shopt -s nullglob
MIG_DIR=""
while IFS= read -r cand; do
  probe=("$cand"/[0-9]*.sql)
  [ "${#probe[@]}" -gt 0 ] && { MIG_DIR="$cand"; break; }
done < <(migration_dirs drizzle "$REPO" "$APP_DIR")
# Prisma apps: no drizzle dir, but prisma/migrations exists → use Prisma's own
# forward-only applier (its _prisma_migrations history table, native guardrails).
# Needs DATABASE_URL (deploy.sh calls us with it tunneled to the box); a
# standalone invocation without it skips with a warning rather than guessing.
if [ -z "$MIG_DIR" ] && [ -d "$(migration_dirs prisma "$REPO" "$APP_DIR")" ]; then
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
SQL_TARGET="${DECLARED_SUPABASE:+supabase}"
SQL_TARGET="${SQL_TARGET:-host}"
if [ -z "$MIG_DIR" ]; then
  while IFS= read -r cand; do
    probe=("$cand"/[0-9]*.sql)
    [ "${#probe[@]}" -gt 0 ] && { MIG_DIR="$cand"; SQL_TARGET="supabase"; break; }
  done < <(migration_dirs supabase "$REPO" "$APP_DIR")
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
  tables=$(printf '%s' "SELECT count(*) FROM information_schema.tables WHERE table_schema='$TARGET_SCHEMA';" | run_sql -qtA)
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

# Create the app's schema and give PostgREST's roles the same access they have
# in printcraft's schema, INCLUDING default privileges — the migrations below
# create their tables after this runs, so a one-off GRANT would miss every one.
if [ "$TARGET_SCHEMA" != "public" ]; then
  printf '%s' "
    CREATE SCHEMA IF NOT EXISTS $TARGET_SCHEMA AUTHORIZATION postgres;
    GRANT USAGE ON SCHEMA $TARGET_SCHEMA TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA $TARGET_SCHEMA
      GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA $TARGET_SCHEMA
      GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA $TARGET_SCHEMA
      GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
  " | run_sql -q
  echo "[schema] $NAME: schema '$TARGET_SCHEMA' ready (usage + default privileges granted)"
fi

pre_exists=$(printf '%s' "SELECT (to_regclass('$LEDGER') IS NOT NULL)::int;" | run_sql -qtA)
printf '%s' "CREATE TABLE IF NOT EXISTS $LEDGER (tag text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());" | run_sql -q

if [ "$pre_exists" != "1" ]; then
  guard_baseline
  if [ "$BASELINE_MODE" = "baseline" ]; then
    vals=$(printf "('%s')," "${MIGS[@]##*/}"); vals=${vals//.sql/}; vals=${vals%,}
    printf '%s' "INSERT INTO $LEDGER(tag) VALUES $vals ON CONFLICT DO NOTHING;" | run_sql -q
    echo "[schema] $NAME: first run — baselined ${#MIGS[@]} existing migration(s), applied none"
    exit 0
  fi
  # BASELINE_MODE=apply — empty database, so fall through and run them all.
  echo "[schema] $NAME: first run against an empty database — applying ${#MIGS[@]} migration(s)"
fi

applied=$(printf '%s' "SELECT tag FROM $LEDGER;" | run_sql -qtA)

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
# ...but only where it is a STATEMENT. `DELETE FROM rate_limits` inside the body
# of `CREATE FUNCTION cleanup_rate_limits()` deletes nothing at apply time — it
# defines a routine. Scanning raw text blocked botsmann's whole deploy on three
# such lines across two migrations, which is the worst way for a gate to be
# wrong: the only way past a gate that will not open is to switch it off.
#
# So dollar-quoted bodies are blanked before the scan. Line numbers are kept so
# the message still points at the real line, and the OPENING line is still
# scanned because everything before `AS $$` on it is genuine DDL.
blocked=0
for f in "${PENDING[@]}"; do
  if hits=$(strip_bodies "$f" | grep -inE "$DESTRUCTIVE"); then
    echo "[schema] $NAME: REFUSING — destructive statement in $(basename "$f"):"
    sed 's/^/    /' <<<"$hits"
    blocked=1
  fi
done
if [ "$blocked" = 1 ]; then
  echo "[schema] $NAME: apply the above by hand, then record the tag(s) in"
  echo "         $LEDGER so this step skips them. Deploy aborted."
  exit 1
fi

# Where do installed extensions actually live? On this box pgvector sits in the
# `printcraft` schema because printcraft's migration created it unqualified —
# so a target schema that needs `vector` must be able to see it.
EXT_SCHEMAS=""
if [ "$TARGET_SCHEMA" != "public" ]; then
  EXT_SCHEMAS=$(printf '%s' "SELECT string_agg(DISTINCT n.nspname, ', ') FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE n.nspname NOT IN ('public','$TARGET_SCHEMA','pg_catalog');" | run_sql -qtA)
fi

# Build one idempotent, transactional batch and record each tag on success.
BATCH=$(mktemp); trap 'rm -f "$BATCH"' EXIT
{
  echo "BEGIN;"
  # Unqualified CREATE TABLE lands in the first schema on the path, so this is
  # what actually keeps a second app out of `public`. Extension schemas are
  # resolved rather than hardcoded: pgvector was installed by whichever app
  # needed it first and lives in THAT app's schema, so `vector` is not
  # reachable from a bare path.
  if [ "$TARGET_SCHEMA" != "public" ]; then
    echo "SET LOCAL search_path TO $TARGET_SCHEMA${EXT_SCHEMAS:+, $EXT_SCHEMAS}, public;"
  fi
  for f in "${PENDING[@]}"; do
    tag=$(basename "$f" .sql)
    echo "-- ===== $tag ====="
    sed -e 's/--> statement-breakpoint//g' -e 's/ADD COLUMN "/ADD COLUMN IF NOT EXISTS "/g' "$f"
    echo "INSERT INTO $LEDGER(tag) VALUES ('$tag') ON CONFLICT DO NOTHING;"
  done
  echo "COMMIT;"
} > "$BATCH"

pending_names=$(printf '%s ' "${PENDING[@]##*/}")
echo "[schema] $NAME: applying ${#PENDING[@]} migration(s): $pending_names"
run_sql -q < "$BATCH"
echo "[schema] $NAME: schema applied ✓"

# Applied is not the same as REACHABLE. PostgREST only serves the schemas named
# in PGRST_DB_SCHEMAS; anything else answers PGRST205 "Could not find the table"
# — which is exactly the 503 botsmann served while its tables were merely
# missing. Having just created them, refuse to call this done if the API cannot
# see them, and say precisely how to fix it rather than warning into a log.
if [ "$TARGET_SCHEMA" != "public" ]; then
  exposed=$(ssh -o BatchMode=yes "$BOX" \
    "sudo docker inspect supabase-rest --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep '^PGRST_DB_SCHEMAS=' || true")
  case ",${exposed#PGRST_DB_SCHEMAS=}," in
    *",$TARGET_SCHEMA,"*)
      echo "[schema] $NAME: PostgREST serves '$TARGET_SCHEMA' ✓" ;;
    *)
      echo "[schema] $NAME: REFUSING — '$TARGET_SCHEMA' exists but PostgREST does not serve it."
      echo "         Every query would return PGRST205 'Could not find the table'."
      echo "         Currently: ${exposed:-<supabase-rest not found>}"
      echo "         Add it in /opt/supabase/docker/.env (PGRST_DB_SCHEMAS), then:"
      echo "           sudo docker compose -f /opt/supabase/docker/docker-compose.yml up -d supabase-rest"
      exit 1 ;;
  esac
fi
