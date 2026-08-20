#!/usr/bin/env bash
# Installs sync-agent-projects-conf.sh as a local systemd --user timer, so
# ~/.config/agent-projects.conf stays in sync with the FleetCrown project
# registry without anyone remembering to run it by hand. Idempotent — safe
# to re-run (e.g. after the repo moves, or to pick up a schedule change).
#
# WHY A DEDICATED WORKTREE: this installer is typically run from whatever
# checkout or worktree an agent happens to be sitting in at the time — a
# feature branch, a job-scoped worktree under .claude/worktrees/ that gets
# cleaned up, or the primary dev checkout, which is routinely mid-work on
# some other branch. Pointing ExecStart at any of those means the timer
# breaks the moment that directory moves off main or gets deleted. Instead,
# this creates (or reuses) a small detached-HEAD worktree pinned at
# "<repo>-scripts", sibling to the primary checkout, used ONLY by this
# timer. ExecStartPre re-fetches and re-checks-out origin/main there before
# every run, so it can never go stale and never collides with a human
# actively developing on a branch (git refuses to check out the same branch
# into two worktrees, which is exactly why this uses --detach).
#
# Usage: scripts/db/install-agent-projects-sync.sh
set -euo pipefail

# --git-common-dir resolves to the ORIGINAL clone's .git even when this
# installer is invoked from a linked worktree — that's what makes the
# dedicated worktree's path stable regardless of where you ran this from.
PRIMARY_GIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && git rev-parse --git-common-dir)"
PRIMARY_REPO_DIR="$(cd "$(dirname "$PRIMARY_GIT_DIR")" && pwd)"
DEDICATED_WORKTREE="${PRIMARY_REPO_DIR}-scripts"
SYNC_SCRIPT="$DEDICATED_WORKTREE/scripts/db/sync-agent-projects-conf.sh"
UNIT_DIR="$HOME/.config/systemd/user"

if [[ -d "$DEDICATED_WORKTREE/.git" || -f "$DEDICATED_WORKTREE/.git" ]]; then
  git -C "$DEDICATED_WORKTREE" fetch --quiet origin main
  git -C "$DEDICATED_WORKTREE" checkout --quiet --detach origin/main
else
  git -C "$PRIMARY_REPO_DIR" worktree add --detach "$DEDICATED_WORKTREE" origin/main
fi

if [[ ! -x "$SYNC_SCRIPT" ]]; then
  echo "install-agent-projects-sync: $SYNC_SCRIPT missing or not executable" >&2
  exit 1
fi

mkdir -p "$UNIT_DIR"

cat > "$UNIT_DIR/agent-projects-sync.service" <<EOF
[Unit]
Description=Sync ~/.config/agent-projects.conf from FleetCrown's project registry
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStartPre=/bin/sh -c 'cd $DEDICATED_WORKTREE && git fetch --quiet origin main && git checkout --quiet --detach origin/main'
ExecStart=$SYNC_SCRIPT
StandardOutput=journal
StandardError=journal
EOF

cat > "$UNIT_DIR/agent-projects-sync.timer" <<'EOF'
[Unit]
Description=Periodic sync of agent-projects.conf from FleetCrown's project registry

[Timer]
OnBootSec=2m
OnUnitActiveSec=15m
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now agent-projects-sync.timer

echo "Installed agent-projects-sync.timer (runs every 15m, plus 2m after boot)."
echo "Status:  systemctl --user status agent-projects-sync.timer"
echo "Logs:    journalctl --user -u agent-projects-sync.service -n 20"
echo "Run now: systemctl --user start agent-projects-sync.service"
