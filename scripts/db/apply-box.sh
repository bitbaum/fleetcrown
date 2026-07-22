#!/usr/bin/env bash
# apply-box.sh — apply a SQL/DDL file to the box FleetCrown DB, THE RIGHT WAY.
#
# WHY: the reflex — `ssh box; sudo -u postgres psql -d fleetcrown -f x.sql` —
# creates objects OWNED BY postgres. `information_schema` is privilege-filtered,
# so the `fleetcrown` app role sees zero columns on those tables: the deploy
# drift-check false-fails and rolls back, and at runtime the app 500s with
# "permission denied for table". This cost two rollbacks (see memory
# pattern-box-ddl-owner-grant). Applying AS THE APP ROLE makes every created
# object owned by `fleetcrown` automatically — no ALTER OWNER, no invisibility.
#
# It connects with the app's own DATABASE_URL (read from the box .env), so the
# CREATE runs as `fleetcrown` over TCP even though the ssh is root.
#
# Usage: bash scripts/db/apply-box.sh <file.sql>   (or: npm run db:apply-box -- <file.sql>)
set -euo pipefail

. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../hetzner" && pwd)/_box-env.sh"  # BOX_ROOT

FILE="${1:?usage: apply-box.sh <file.sql>}"
[ -f "$FILE" ] || { echo "apply-box: no such file: $FILE" >&2; exit 1; }
BASENAME="$(basename "$FILE")"
REMOTE_TMP="/tmp/apply-box-${BASENAME}"

echo "→ apply-box: shipping $BASENAME to $BOX_ROOT"
scp -q "$FILE" "$BOX_ROOT:$REMOTE_TMP"

ssh "$BOX_ROOT" "REMOTE_TMP='$REMOTE_TMP' BASENAME='$BASENAME' LC_ALL=C bash -s" <<'REMOTE'
set -euo pipefail
DBURL=$(grep -oP '^DATABASE_URL=\K.*' /opt/fleetcrown/app/.env 2>/dev/null | head -1 | tr -d '"')
[ -n "$DBURL" ] || { echo "apply-box: could not read box DATABASE_URL" >&2; exit 1; }
echo "→ apply-box: applying $BASENAME as the app role (owner = app user)"
psql "$DBURL" -v ON_ERROR_STOP=1 -f "$REMOTE_TMP"
rm -f "$REMOTE_TMP"
echo "✓ apply-box: applied; objects owned by the app role and visible to the app"
REMOTE

echo "✓ apply-box: done. Verify with 'npm run check:schema' or a deploy."
