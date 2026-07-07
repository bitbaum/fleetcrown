#!/usr/bin/env bash
#
# Move the box-runner off `ubuntu` onto a dedicated, unprivileged `fcrunner`
# user (DevOps remediation #1 — thorough version, beyond the drop-in).
#
# WHY beyond harden-box-runner.sh: that drop-in hides co-tenant secrets from the
# runner but it still RUNS as `ubuntu`, which owns every app's files. A dedicated
# user that owns only its own dir is real privilege separation — a compromised
# agent isn't `ubuntu` and can't fall back on ubuntu's file ownership.
#
# WHAT it does on the box (idempotent):
#   1. create the `fcrunner` user (system account, home /home/fcrunner, bash for PTYs)
#   2. copy the AGENT RUNTIME from /home/ubuntu → /home/fcrunner: .claude (auth +
#      credentials.json + sessions/memory), .local (the claude CLI), .npm,
#      .gitconfig, and the runner token — NOT ubuntu's .ssh or anything else
#   3. chown /opt/fleetcrown/runner to fcrunner (it owns its code + its own .env)
#   4. install a systemd drop-in: User=fcrunner, HOME/PATH repointed, and
#      InaccessiblePaths hiding ALL of /home/ubuntu + every co-tenant /opt/<app>
#   5. daemon-reload + restart + verify
#
# COUPLING you must not forget: deploy-hetzner.sh / install-box-runner.sh chown
# the runner dir on every run. After this migration, run those with
# FLEETCROWN_RUNNER_OWNER=fcrunner (add it to the push-deploy hook env) or the
# next deploy silently chowns the dir back to ubuntu. This script prints a
# reminder; the vars already default to ubuntu so nothing breaks pre-migration.
#
# RISK (verify before trusting): the `claude` CLI's auth/config must survive the
# home copy. credentials.json lives in ~/.claude, so copying .claude + .local
# should preserve it — but CONFIRM with a test dispatch (below) before relying on
# unattended runs. Fully reversible: --revert restores User=ubuntu.
#
# Usage:
#   bash scripts/hetzner/migrate-box-runner-to-fcrunner.sh --dry-run  # print the plan
#   bash scripts/hetzner/migrate-box-runner-to-fcrunner.sh            # apply
#   bash scripts/hetzner/migrate-box-runner-to-fcrunner.sh --revert   # back to ubuntu
set -euo pipefail

HOST="${FLEETCROWN_BOX_HOST:-root@167.233.22.31}"
MODE="${1:-apply}"
case "$MODE" in --dry-run) MODE=dry ;; --revert) MODE=revert ;; "" ) MODE=apply ;; --*) echo "unknown flag: $MODE" >&2; exit 2 ;; esac

# The remote worker. Reads $1 = mode. Kept in one heredoc so the whole migration
# is a single auditable unit.
run_remote() {
  ssh "$HOST" "MODE='$1' bash -s" <<'REMOTE'
set -euo pipefail
UNIT=fleetcrown-box-runner.service
DROPIN_DIR="/etc/systemd/system/${UNIT}.d"
DROPIN="${DROPIN_DIR}/20-fcrunner.conf"
RUNNER_DIR=/opt/fleetcrown/runner
SRC=/home/ubuntu
DST=/home/fcrunner

# Agent-runtime dirs to carry over (NOT .ssh, NOT anything else in ubuntu's home).
COPY=(.claude .local .npm .gitconfig)

# Co-tenant paths the runner must never read (+ all of /home/ubuntu once moved).
INACCESSIBLE="-/home/ubuntu -/opt/orangecat -/opt/kivvi -/opt/botsmann -/opt/datacat-api -/opt/datacat-web -/opt/petvity -/opt/printcraft -/opt/reparaturbonus-zh -/opt/revamp-info -/opt/revampit -/opt/sbb-lost-found -/opt/solon -/opt/surf-your-life -/opt/vitareba -/opt/aoz-wohnen -/opt/supabase -/opt/backups -/opt/monitoring -/opt/_appcron"

read -r -d '' DROPIN_BODY <<CONF || true
[Service]
# Run as the dedicated, unprivileged fcrunner user (migrate-box-runner-to-fcrunner.sh).
User=fcrunner
Environment=HOME=/home/fcrunner
Environment=PATH=/home/fcrunner/.local/bin:/usr/local/bin:/usr/bin:/bin
NoNewPrivileges=true
PrivateTmp=true
InaccessiblePaths=${INACCESSIBLE}
CONF

if [ "$MODE" = revert ]; then
  echo "→ revert: removing fcrunner drop-in (fcrunner user + copied home left in place, harmless)"
  rm -f "$DROPIN"
  systemctl daemon-reload
  systemctl restart "$UNIT"; sleep 4
  echo -n "  runner active: "; systemctl is-active "$UNIT"
  echo "  → also unset FLEETCROWN_RUNNER_OWNER in your deploy env (back to ubuntu)."
  exit 0
fi

if [ "$MODE" = dry ]; then
  echo "PLAN (nothing changed):"
  echo "  1. useradd fcrunner (home $DST, shell /bin/bash) if missing"
  echo "  2. copy from $SRC → $DST: ${COPY[*]} + .config/fleetcrown/fleet-runner-token"
  echo "  3. chown -R fcrunner:fcrunner $RUNNER_DIR  (chmod 600 its .env)"
  echo "  4. write $DROPIN:"; printf '%s\n' "$DROPIN_BODY" | sed 's/^/       /'
  echo "  5. daemon-reload + restart + verify"
  exit 0
fi

echo "→ 1/5 ensure fcrunner user"
id fcrunner >/dev/null 2>&1 || useradd -m -d "$DST" -s /bin/bash fcrunner
install -d -o fcrunner -g fcrunner -m 700 "$DST"

echo "→ 2/5 copy agent runtime (auth/CLI/state) — NOT ubuntu's .ssh"
for d in "${COPY[@]}"; do
  if [ -e "$SRC/$d" ] && [ ! -e "$DST/$d" ]; then cp -a "$SRC/$d" "$DST/$d"; echo "   copied $d"; fi
done
install -d -o fcrunner -g fcrunner -m 700 "$DST/.config/fleetcrown"
if [ -f "$SRC/.config/fleetcrown/fleet-runner-token" ] && [ ! -f "$DST/.config/fleetcrown/fleet-runner-token" ]; then
  cp -a "$SRC/.config/fleetcrown/fleet-runner-token" "$DST/.config/fleetcrown/"
  echo "   copied runner token"
fi
chown -R fcrunner:fcrunner "$DST"

echo "→ 3/5 give fcrunner its runner dir + own .env"
chown -R fcrunner:fcrunner "$RUNNER_DIR"
[ -f "$RUNNER_DIR/.env" ] && chmod 600 "$RUNNER_DIR/.env"

echo "→ 4/5 install user drop-in"
mkdir -p "$DROPIN_DIR"
printf '%s\n' "$DROPIN_BODY" > "$DROPIN"

echo "→ 5/5 daemon-reload + restart + verify"
systemctl daemon-reload
systemctl restart "$UNIT"; sleep 4
echo -n "  runner active: "; systemctl is-active "$UNIT"
echo -n "  running as user: "; ps -o user= -C tsx 2>/dev/null | sort -u | head -1 || echo "?"
echo -n "  co-tenant .env readable by runner? "
systemd-run --quiet --pipe -p User=fcrunner -p InaccessiblePaths="-/opt/orangecat" \
  cat /opt/orangecat/app/.env >/dev/null 2>&1 && echo "YES (unexpected)" || echo "NO ✓ (blocked)"
REMOTE
}

if [ "$MODE" = dry ]; then
  echo "== fcrunner migration — DRY RUN =="
  run_remote dry
  exit 0
fi

if [ "$MODE" = revert ]; then
  run_remote revert
  echo "✓ reverted to User=ubuntu"
  exit 0
fi

echo "== fcrunner migration — APPLY =="
run_remote apply
cat <<'NEXT'

✓ box-runner migrated to fcrunner.

MUST DO NEXT (or the next deploy reverts ownership to ubuntu):
  Set FLEETCROWN_RUNNER_OWNER=fcrunner wherever deploy-hetzner.sh runs — add it
  to the push-deploy block in .husky/pre-push, e.g.
      env FLEETCROWN_RUNNER_OWNER=fcrunner bash scripts/deploy-hetzner.sh --ref "$SHA"

VERIFY BEFORE TRUSTING (the claude-auth-after-copy risk):
  1. Dispatch a small task from /control to a project.
  2. ssh root@167.233.22.31 journalctl -u fleetcrown-box-runner -f
  3. Confirm the runner clones into /home/fcrunner/dev, the agent AUTHENTICATES
     (no login prompt), runs, and reports back. If claude asks to log in, copy
     ubuntu's creds: cp -a /home/ubuntu/.claude/credentials.json /home/fcrunner/.claude/ && chown fcrunner:fcrunner /home/fcrunner/.claude/credentials.json

ROLL BACK anytime: bash scripts/hetzner/migrate-box-runner-to-fcrunner.sh --revert
NEXT
