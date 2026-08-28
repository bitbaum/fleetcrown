#!/usr/bin/env bash
# install-fleet-refs-audit.sh — run the fleet reference audit ON THE BOX and
# alert to Telegram, on transition only.
#
# WHY THE BOX AND NOT ACTIONS: the audit catches a `uses:` that names an owner
# GitHub only redirects to — the failure that stopped every merge and deploy in
# the fleet three times in three days. Actions can run it, but a red Actions run
# is a channel nobody watches, so detection was closed and notification was not.
# Here it reuses the watchdog's Telegram channel, which is the one that reaches
# a phone.
#
# NO NEW SECRETS. The GitHub token comes from root's already-authenticated `gh`
# on this box; the Telegram credentials come from /opt/monitoring/telegram.env,
# which host-check and the OnFailure notifier already use.
#
# ONE IMPLEMENTATION. It runs the very same scripts/ci/fleet-refs-audit.mjs the
# repo ships, which the deploy rsyncs to /opt/fleetcrown/app — a second copy in
# shell would drift from the first the moment either changed.
#
# Idempotent — safe to re-run.
# Usage: bash scripts/hetzner/install-fleet-refs-audit.sh
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

ssh -o BatchMode=yes "$BOX" 'sudo bash -s' <<'REMOTE'
set -euo pipefail
MON=/opt/monitoring
mkdir -p "$MON/state"

cat > "$MON/fleet-refs-check.sh" <<'CHK'
#!/usr/bin/env bash
# Fleet reference audit -> Telegram. Invoked by fleetcrown-fleet-refs.timer.
#
# Deliberately NOT `set -e`: this script's whole job is to run a command that is
# EXPECTED to exit non-zero and report on it. Under -e the failing run would
# kill the script before it could alert — the check would go silent at exactly
# the moment it had something to say.
set -u
MON="${MON:-/opt/monitoring}"
. "$MON/lib-alert.sh"
AUDIT=/opt/fleetcrown/app/scripts/ci/fleet-refs-audit.mjs

# "Could not look" is tracked on its OWN key. Folding it into the verdict key
# would let a broken probe overwrite a real finding, and would report a missing
# token as though the fleet had been checked and found clean.
if [ ! -r "$AUDIT" ]; then
  alert_transition fleet_refs_probe bad "🔎" "Fleet ref audit CANNOT RUN: $AUDIT missing (deploy changed?)"
  exit 0
fi
TOKEN="$(gh auth token 2>/dev/null || true)"
if [ -z "$TOKEN" ]; then
  alert_transition fleet_refs_probe bad "🔎" "Fleet ref audit CANNOT RUN: no GitHub token on the box (\`gh auth login\` as root)"
  exit 0
fi
alert_transition fleet_refs_probe ok "🔎" ""

out=$(GITHUB_TOKEN="$TOKEN" FLEET_ORG=bitbaum RETIRED_HANDLES=maonakamoto \
      SELF_REPO=fleetcrown MIN_REPOS=10 node "$AUDIT" 2>&1)
rc=$?

# if/else, never `check && alert ... || alert ...`. A caller written that way
# read the alert branch's exit status as the check result and re-alerted every
# tick — the 2026-08-05 storm, 40 alert/RECOVERED pairs in 3h.
if [ "$rc" -ne 0 ]; then
  detail=$(printf '%s\n' "$out" | grep -E '^::error::' | sed 's/^::error:://' | head -5)
  [ -z "$detail" ] && detail=$(printf '%s\n' "$out" | tail -3)
  alert_transition fleet_refs bad "🔗" "Fleet reference audit FAILED — merges/deploys may be silently dead:
${detail}"
else
  alert_transition fleet_refs ok "🔗" ""
fi
exit 0
CHK
chmod +x "$MON/fleet-refs-check.sh"

cat > /etc/systemd/system/fleetcrown-fleet-refs.service <<'SVC'
[Unit]
Description=Fleet reference audit (stale `uses:` owner detector)
[Service]
Type=oneshot
ExecStart=/opt/monitoring/fleet-refs-check.sh
SVC

cat > /etc/systemd/system/fleetcrown-fleet-refs.timer <<'TMR'
[Unit]
Description=Run the fleet reference audit every 6h
[Timer]
OnCalendar=*-*-* 00,06,12,18:00:00
RandomizedDelaySec=300
Persistent=true
[Install]
WantedBy=timers.target
TMR

systemctl daemon-reload
systemctl enable --now fleetcrown-fleet-refs.timer >/dev/null
echo "installed:"
systemctl list-timers --all | grep fleet-refs || true
REMOTE
