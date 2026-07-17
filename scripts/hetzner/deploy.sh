#!/usr/bin/env bash
# Build a Next.js app (standalone) and deploy it to /opt/<name>/app on the box.
# Generalizes the orangecat/revampit cutover flow from the runbook:
#   build → stage standalone + static + public → rsync → restart → health check.
# Runtime env: <repo>/<app_dir>/.env.selfhost.local is uploaded as /opt/<name>/app/.env
# ONLY if missing on the box (box env is never overwritten — fix it there or pass --env).
# Usage: deploy.sh <app> [--env]   (--env force-uploads .env.selfhost.local)
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

app_lookup "${1:?usage: deploy.sh <app> [--env]}"
FORCE_ENV="${2:-}"
SRC="$REPO/$APP_DIR"

[ -d "$SRC" ] || { echo "ERROR: $SRC missing"; exit 1; }
cd "$SRC"

# Build with the runtime env: NEXT_PUBLIC_* is baked at build time, and SSG
# pages may query the DB — tunnel build-time DB access to the box's Postgres.
[ -f "$SRC/.env.selfhost.local" ] || { echo "ERROR: $SRC/.env.selfhost.local missing — run gen-env.sh $NAME"; exit 1; }
set -a; source "$SRC/.env.selfhost.local"; set +a
STAGE=""
TUNNEL_SOCK=$(mktemp -u /tmp/deploy-tunnel.XXXXXX)
ssh -o BatchMode=yes -f -N -M -S "$TUNNEL_SOCK" -L 15432:localhost:5432 "$BOX"
trap 'ssh -S "$TUNNEL_SOCK" -O exit "$BOX" 2>/dev/null; [ -n "$STAGE" ] && rm -rf "$STAGE"' EXIT
[ -n "${DATABASE_URL:-}" ] && export DATABASE_URL="${DATABASE_URL/@localhost:5432/@127.0.0.1:15432}"
[ -n "${DIRECT_URL:-}" ] && export DIRECT_URL="${DIRECT_URL/@localhost:5432/@127.0.0.1:15432}"

# Reconcile DB schema BEFORE building — SSG may query columns/tables that the new
# code introduces. Guarded: applies only pending, additive migrations and refuses
# any destructive diff (aborts without shipping). See apply-schema.sh.
if [ "$DB" != "-" ]; then
  "$(dirname "${BASH_SOURCE[0]}")/apply-schema.sh" "$NAME" "$REPO" "$DB" "$APP_DIR" \
    || { echo "ERROR: schema step failed — deploy aborted (no code shipped)"; exit 1; }
fi

echo "=== build $NAME ($SRC) ==="
SELF_HOST=1 npm run build

ST="$SRC/.next/standalone"
[ -d "$ST" ] || { echo "ERROR: no standalone output — set output:'standalone' in next.config"; exit 1; }

STAGE=$(mktemp -d)
cp -r "$ST"/. "$STAGE/"
# static + public live next to the (possibly monorepo-nested) server.js
NEST=$(cd "$STAGE" && find . -maxdepth 4 -name server.js -not -path '*node_modules*' | head -1 | xargs dirname)
cp -r "$SRC/.next/static" "$STAGE/$NEST/.next/static"
[ -d "$SRC/public" ] && cp -r "$SRC/public" "$STAGE/$NEST/public"

if [ "$FORCE_ENV" = "--env" ] || ! box "test -f /opt/$NAME/app/.env"; then
  [ -f "$SRC/.env.selfhost.local" ] || { echo "ERROR: $SRC/.env.selfhost.local missing"; exit 1; }
  scp -o BatchMode=yes "$SRC/.env.selfhost.local" "$BOX:/opt/$NAME/app/.env"
  box "chmod 600 /opt/$NAME/app/.env"
  echo "uploaded .env"
fi

echo "=== rsync → /opt/$NAME/app ==="
for attempt in 1 2 3; do
  rsync -az --delete --partial \
    -e "ssh -o BatchMode=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=4" \
    --exclude '.env' --exclude 'launch.sh' \
    "$STAGE"/ "$BOX:/opt/$NAME/app/" && break
  echo "rsync attempt $attempt failed, retrying in 5s..."; sleep 5
  [ "$attempt" = 3 ] && { echo "ERROR: rsync failed after 3 attempts"; exit 1; }
done

box "sudo systemctl restart $NAME-app"
sleep 4
status=$(box "systemctl is-active $NAME-app")
code=$(box "curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://localhost:$PORT/")
echo "RESULT $NAME: systemd=$status http=$code"
[ "$status" = "active" ] && { [ "$code" -ge 200 ] && [ "$code" -lt 400 ]; }
