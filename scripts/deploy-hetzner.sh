#!/usr/bin/env bash
# deploy-hetzner.sh — ship the production build to the bitbaum Hetzner box.
#
# The box serves FleetCrown at https://fleetcrown.orangecat.ch (Caddy →
# 127.0.0.1:4002, systemd unit fleetcrown-app). Box-side .env, launch.sh and
# backups/ are owned by the box and never touched by a deploy.
#
# Also syncs + restarts fleetcrown-box-runner (the always-on cloud builder).
# First-time install: bash scripts/hetzner/install-box-runner.sh
#
# Usage:
#   bash scripts/deploy-hetzner.sh            # build + rsync + restart
#   bash scripts/deploy-hetzner.sh --no-build # rsync an existing build

set -euo pipefail

HOST="root@${HETZNER_IP:-167.233.22.31}"
APP_DIR="/opt/fleetcrown/app"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STANDALONE="$PROJECT_DIR/.next/standalone"

# Args:
#   --no-build     rsync the existing $STANDALONE as-is
#   --ref <sha>    only build+ship if the working tree is STILL on that commit
#                  (used by the push-deploy hook). `npm run build` always compiles
#                  the floating working tree, so a hook that fires after you've
#                  switched branches would otherwise ship the wrong ref (it once
#                  shipped an off-main feature branch to the box). An isolated
#                  worktree would be ideal but Turbopack rejects an out-of-root
#                  node_modules symlink, so we guard in-place instead: build only
#                  when HEAD == ref, and re-check HEAD after the build so a switch
#                  mid-build can't ship a torn tree. On drift we skip loudly
#                  rather than ship wrong code.
NO_BUILD=""; REF=""
while [ $# -gt 0 ]; do
  case "$1" in
    --no-build) NO_BUILD=1; shift ;;
    --ref)      REF="${2:-}"; shift 2 ;;
    *)          shift ;;
  esac
done

git_head() { git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null || echo unknown; }

if [ -n "$NO_BUILD" ]; then
  :  # reuse the existing $STANDALONE
elif [ -n "$REF" ]; then
  CURRENT="$(git_head)"
  if [ "$CURRENT" != "$REF" ]; then
    echo "✗ pinned deploy SKIPPED — working tree is on ${CURRENT:0:12}, not the pushed ref ${REF:0:12}."
    echo "  A backgrounded push-deploy must not build whatever branch you've since switched to."
    echo "  Deploy it explicitly: git checkout ${REF:0:12} && bash scripts/deploy-hetzner.sh   (or push from main again)"
    exit 1
  fi
  # Pass the pinned ref into the build env so the postbuild (deploy-local.sh)
  # gates the LOCAL systemd restart on it too. Without this, a HEAD switch
  # mid-build is caught here (box rsync aborts) but the postbuild has already
  # restarted the local prod service with the torn build — the box was protected
  # but local was not. Now a drifted pinned build restarts nothing, anywhere.
  (cd "$PROJECT_DIR" && FLEETCROWN_DEPLOY_REF="$REF" npm run build)
  AFTER="$(git_head)"
  if [ "$AFTER" != "$REF" ]; then
    echo "✗ pinned deploy ABORTED — HEAD moved to ${AFTER:0:12} during the build; not shipping a torn tree (local restart was skipped too)." >&2
    exit 1
  fi
else
  (cd "$PROJECT_DIR" && npm run build)
fi

if [ ! -d "$STANDALONE/.next/static" ]; then
  echo "✗ $STANDALONE missing static assets — run npm run build first" >&2
  exit 1
fi

echo "→ rsync standalone → $HOST:$APP_DIR"
rsync -az --delete \
  --exclude '.env' \
  --exclude 'launch.sh' \
  --exclude 'backups' \
  "$STANDALONE/" "$HOST:$APP_DIR/"

echo "→ restart fleetcrown-app on box"
ssh "$HOST" "chown -R ubuntu:ubuntu $APP_DIR \
  && systemctl restart fleetcrown-app \
  && sleep 3 \
  && systemctl is-active fleetcrown-app >/dev/null"

# Post-deploy verification — fails the deploy LOUDLY (set -e) instead of
# shipping a silently-broken auth/email config. Catches the X-saga failure
# mode: a provider silently un-mounting when its env keys go missing.
echo "→ post-deploy verification"
ssh "$HOST" 'set -e
  base=http://127.0.0.1:4002
  code=$(curl -s -o /dev/null -w "%{http_code}" "$base/sign-in")
  echo "  /sign-in: $code"; [ "$code" = 200 ] || { echo "  ✗ sign-in not 200"; exit 1; }
  # /api/health returns 503 when env.ts finds a fatal/error config issue
  hcode=$(curl -s -o /dev/null -w "%{http_code}" "$base/api/health")
  echo "  /api/health: $hcode"; [ "$hcode" = 200 ] || { echo "  ✗ env health degraded — see debug_logs source=instrumentation/env"; exit 1; }
  # Expected auth providers must actually be mounted (not just env-gated in the UI)
  prov=$(curl -s "$base/api/auth/providers")
  for p in github google x-1a email-password; do
    echo "$prov" | grep -q "\"$p\"" || { echo "  ✗ auth provider missing: $p"; exit 1; }
  done
  echo "  ✓ providers mounted: github google x-1a email-password"'

# Schema-drift guard against the BOX database. The pre-push check (scripts/
# check-schema-drift.ts) runs against the laptop DB; the box has its own
# Postgres, so a table added in code but never pushed there silently 500s the
# first feature that queries it (how /prompts, /loki and System cron went dark
# locally). Print the schema-declared tables here, fetch the box's tables over
# ssh, and diff — fail LOUDLY so the operator runs drizzle-kit push against the
# box instead of trusting a half-broken deploy.
echo "→ schema-drift check (box DB)"
DECLARED=$(cd "$PROJECT_DIR" && npx tsx scripts/check-schema-drift.ts --print 2>/dev/null | sort)
BOX_TABLES=$(ssh "$HOST" 'LC_ALL=C bash -s' <<'REMOTE' | sort
DBURL=$(grep -oP '^DATABASE_URL=\K.*' /opt/fleetcrown/app/.env 2>/dev/null | head -1 | tr -d '"')
psql "$DBURL" -t -A -c "select table_name from information_schema.tables where table_schema = 'public'" 2>/dev/null
REMOTE
)
MISSING=$(comm -23 <(printf '%s\n' "$DECLARED") <(printf '%s\n' "$BOX_TABLES"))
if [ -n "$MISSING" ]; then
  echo "  ✗ box DB is missing declared tables:"
  printf '%s\n' "$MISSING" | sed 's/^/    - /'
  echo "  → run 'DATABASE_URL=<box> npx drizzle-kit push' before trusting this deploy"
  exit 1
fi
echo "  ✓ schema: all $(printf '%s\n' "$DECLARED" | grep -c .) declared tables present on box"

echo "✓ deployed $(git -C "$PROJECT_DIR" rev-parse --short "${REF:-HEAD}") to Hetzner — verified"

# Cloud builder (box-runner) — separate systemd unit from fleetcrown-app so app
# deploys never kill running agent PTYs. Still sync runner code on every ship
# so poller/pty-runtime fixes reach the always-on executor.
RUNNER_DIR="/opt/fleetcrown/runner"
echo "→ sync box-runner code → $HOST:$RUNNER_DIR"
rsync -az --no-perms --omit-dir-times \
  "$PROJECT_DIR/src/" "$HOST:$RUNNER_DIR/src/"
rsync -az --no-perms --omit-dir-times \
  "$PROJECT_DIR/desktop/src/" "$HOST:$RUNNER_DIR/desktop/src/"
rsync -az --no-perms --omit-dir-times \
  "$PROJECT_DIR/scripts/box-runner.ts" \
  "$PROJECT_DIR/scripts/mint-box-runner-token.ts" \
  "$HOST:$RUNNER_DIR/scripts/"
rsync -a "$PROJECT_DIR/tsconfig.json" "$HOST:$RUNNER_DIR/tsconfig.json"
ssh "$HOST" "chown -R ubuntu:ubuntu $RUNNER_DIR/src $RUNNER_DIR/desktop $RUNNER_DIR/scripts $RUNNER_DIR/tsconfig.json"

echo "→ restart fleetcrown-box-runner (cloud builder)"
ssh "$HOST" "systemctl restart fleetcrown-box-runner \
  && sleep 4 \
  && systemctl is-active fleetcrown-box-runner >/dev/null"
echo "  ✓ fleetcrown-box-runner active (cloud builder)"
