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
# The box-runner's Unix owner. Defaults to ubuntu; set to fcrunner AFTER running
# migrate-box-runner-to-fcrunner.sh so the runner-code sync doesn't chown the
# dir back to ubuntu on every deploy. The app + bridge stay ubuntu-owned.
RUNNER_OWNER="${FLEETCROWN_RUNNER_OWNER:-ubuntu}"
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

# ── Serialize deploys (fix: concurrent-build collision) ──────────────────────
# Two near-simultaneous pushes to main each background a deploy; without a lock
# both run `npm run build` in the shared .next tree and collide ("Another next
# build process is already running"), and the OLDER ref can win the race. A
# blocking lock serializes deploys so the NEWEST ref ships last; every step
# below is idempotent, so waiting is always safe.
LOCK_FILE="${FLEETCROWN_DEPLOY_LOCK:-/tmp/fleetcrown-deploy.lock}"
exec 9>"$LOCK_FILE"
if command -v flock >/dev/null 2>&1; then
  if ! flock -w 900 9; then
    echo "✗ deploy: timed out after 15m waiting for an in-flight deploy — aborting" >&2
    exit 1
  fi
fi

# ── Deploy-result sink (fix: exit 0 masked failed deploys) ───────────────────
# The push-deploy hook backgrounds this script and its exit code dies in a
# detached log nobody reads. Record every outcome: a final status line, a
# desktop notification (best-effort), and a row in the box debug_logs so a
# failed deploy surfaces on /system instead of being invisible until a 503.
DEPLOY_REF_SHORT="$(git -C "$PROJECT_DIR" rev-parse --short "${REF:-HEAD}" 2>/dev/null || echo unknown)"
report_deploy_status() {
  local code=$?
  local level msg
  if [ "$code" = 0 ]; then
    level=info; msg="deploy OK: ${DEPLOY_REF_SHORT} to Hetzner"
  else
    level=error; msg="deploy FAILED (exit ${code}): ${DEPLOY_REF_SHORT} — see /tmp/push-deploy-fleetcrown.log"
  fi
  echo "→ ${msg}"
  command -v notify-send >/dev/null 2>&1 && notify-send "FleetCrown deploy" "$msg" >/dev/null 2>&1 || true
  # Durable record in the box DB — best-effort, must never change the exit code.
  # msg is fixed text + a short SHA (no single-quotes), so it is SQL-safe here.
  ssh -o ConnectTimeout=10 "$HOST" "LC_ALL=C bash -s" >/dev/null 2>&1 <<REMOTE || true
DBURL=\$(grep -oP '^DATABASE_URL=\K.*' /opt/fleetcrown/app/.env 2>/dev/null | head -1 | tr -d '"')
[ -n "\$DBURL" ] && psql "\$DBURL" -q -c "insert into debug_logs (source, level, message) values ('deploy', '${level}', '${msg}')" 2>/dev/null
REMOTE
}
trap report_deploy_status EXIT

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

if [ -z "$NO_BUILD" ]; then
  (cd "$PROJECT_DIR" && npm --prefix bridge run build)
fi

if [ ! -d "$STANDALONE/.next/static" ]; then
  echo "✗ $STANDALONE missing static assets — run npm run build first" >&2
  exit 1
fi

# Snapshot the current box build for one-command rollback (fix: in-place rsync
# left no way back from a broken restart). Excludes backups/ so we don't copy
# the dump store every deploy; .env + launch.sh ARE snapshotted so a rollback
# restores a coherent tree.
echo "→ snapshot current box build → $APP_DIR.prev"
ssh "$HOST" "test -d '$APP_DIR' && rsync -a --delete --exclude backups '$APP_DIR/' '$APP_DIR.prev/'" \
  || echo "  (no prior build to snapshot)"

# Restore the previous build if a ship fails its restart/verification, so a
# broken deploy doesn't strand the box. --delete but --exclude backups, so the
# dump store is never touched; .env/launch.sh come from the snapshot.
rollback_box() {
  echo "↩ deploy failed after ship — rolling box back to previous build" >&2
  if ssh "$HOST" "test -d '$APP_DIR.prev' \
    && rsync -a --delete --exclude backups '$APP_DIR.prev/' '$APP_DIR/' \
    && chown -R ubuntu:ubuntu '$APP_DIR' \
    && systemctl restart fleetcrown-app && sleep 3 \
    && systemctl is-active fleetcrown-app >/dev/null"; then
    echo "  ✓ rolled back to previous build" >&2
  else
    echo "  ✗ ROLLBACK FAILED — box needs manual attention" >&2
  fi
}

echo "→ rsync standalone → $HOST:$APP_DIR"
rsync -az --delete \
  --exclude '.env' \
  --exclude 'launch.sh' \
  --exclude 'backups' \
  "$STANDALONE/" "$HOST:$APP_DIR/"

echo "→ restart fleetcrown-app on box"
# timeout: this ssh once hung for 47 minutes AFTER the restart completed on
# the box (channel never closed), freezing the deploy before verification and
# the runner sync — the push looked deployed but the runner kept old code.
# Every step below this one is idempotent, so a killed-and-rerun deploy is
# always safe; a silently hung one is not.
if ! timeout 180 ssh -o ServerAliveInterval=15 -o ServerAliveCountMax=6 "$HOST" \
  "chown -R ubuntu:ubuntu $APP_DIR \
  && systemctl restart fleetcrown-app \
  && sleep 3 \
  && systemctl is-active fleetcrown-app >/dev/null"; then
  echo "✗ restart failed on box" >&2; rollback_box; exit 1
fi

# Post-deploy verification — fails the deploy LOUDLY instead of shipping a
# silently-broken auth/email config, and rolls back. Catches the X-saga
# failure mode: a provider silently un-mounting when its env keys go missing.
echo "→ post-deploy verification"
if ! ssh "$HOST" 'set -e
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
  echo "  ✓ providers mounted: github google x-1a email-password"'; then
  echo "✗ post-deploy verification failed" >&2; rollback_box; exit 1
fi

# Schema-drift guard against the BOX database. The pre-push check (scripts/
# check-schema-drift.ts) runs against the laptop DB; the box has its own
# Postgres, so a table/column added in code but never pushed there silently
# 500s the first feature that queries it. Print the schema-declared tables and
# columns here, fetch the box's tables/columns over ssh, and diff — fail LOUDLY
# instead of trusting a half-broken deploy.
echo "→ schema-drift check (box DB)"
DECLARED=$(cd "$PROJECT_DIR" && npx tsx scripts/check-schema-drift.ts --print 2>/dev/null | sort)
DECLARED_COLUMNS=$(cd "$PROJECT_DIR" && npx tsx scripts/check-schema-drift.ts --print-columns 2>/dev/null | sort)
BOX_TABLES=$(ssh "$HOST" 'LC_ALL=C bash -s' <<'REMOTE' | sort
DBURL=$(grep -oP '^DATABASE_URL=\K.*' /opt/fleetcrown/app/.env 2>/dev/null | head -1 | tr -d '"')
psql "$DBURL" -t -A -c "select table_name from information_schema.tables where table_schema = 'public'" 2>/dev/null
REMOTE
)
BOX_COLUMNS=$(ssh "$HOST" 'LC_ALL=C bash -s' <<'REMOTE' | sort
DBURL=$(grep -oP '^DATABASE_URL=\K.*' /opt/fleetcrown/app/.env 2>/dev/null | head -1 | tr -d '"')
psql "$DBURL" -t -A -c "select table_name || '.' || column_name from information_schema.columns where table_schema = 'public'" 2>/dev/null
REMOTE
)
MISSING=$(comm -23 <(printf '%s\n' "$DECLARED") <(printf '%s\n' "$BOX_TABLES"))
MISSING_COLUMNS=$(comm -23 <(printf '%s\n' "$DECLARED_COLUMNS") <(printf '%s\n' "$BOX_COLUMNS"))
if [ -n "$MISSING" ] || [ -n "$MISSING_COLUMNS" ]; then
  echo "  ✗ box DB is missing declared tables:"
  [ -n "$MISSING" ] && printf '%s\n' "$MISSING" | sed 's/^/    - /' || echo "    - none"
  echo "  ✗ box DB is missing declared columns:"
  [ -n "$MISSING_COLUMNS" ] && printf '%s\n' "$MISSING_COLUMNS" | sed 's/^/    - /' || echo "    - none"
  echo "  → run 'DATABASE_URL=<box> npx drizzle-kit push' before trusting this deploy"
  exit 1
fi
echo "  ✓ schema: all $(printf '%s\n' "$DECLARED" | grep -c .) declared tables and $(printf '%s\n' "$DECLARED_COLUMNS" | grep -c .) declared columns present on box"

echo "✓ deployed $(git -C "$PROJECT_DIR" rev-parse --short "${REF:-HEAD}") to Hetzner — verified"

# Event bridge — separate from the Next app and runner, but part of the same
# control-plane protocol. Sync it here so SSE/rawkey/presence contracts cannot
# drift between deploys.
BRIDGE_DIR="/opt/fleetcrown/bridge"
echo "→ sync event bridge → $HOST:$BRIDGE_DIR"
rsync -az --delete --no-perms --omit-dir-times \
  --exclude '.env' \
  --exclude 'node_modules' \
  "$PROJECT_DIR/bridge/" "$HOST:$BRIDGE_DIR/"
ssh "$HOST" "chown -R ubuntu:ubuntu $BRIDGE_DIR \
  && systemctl restart fleetcrown-bridge \
  && sleep 2 \
  && systemctl is-active fleetcrown-bridge >/dev/null"
echo "  ✓ fleetcrown-bridge active"

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
ssh "$HOST" "chown -R $RUNNER_OWNER:$RUNNER_OWNER $RUNNER_DIR/src $RUNNER_DIR/desktop $RUNNER_DIR/scripts $RUNNER_DIR/tsconfig.json"

echo "→ restart fleetcrown-box-runner (cloud builder)"
ssh "$HOST" "systemctl restart fleetcrown-box-runner \
  && sleep 4 \
  && systemctl is-active fleetcrown-box-runner >/dev/null"
echo "  ✓ fleetcrown-box-runner active (cloud builder)"
