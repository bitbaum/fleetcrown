#!/usr/bin/env bash
# Provision a new OrangeCat customer site on bitbaum.
#
# Extends the battle-tested apps.conf → sync-infra → gen-env → deploy path.
# Does NOT auto-create git repos or DNS records — outputs a checklist for those.
#
# Usage:
#   provision-site.sh <slug> --repo /home/g/dev/<repo> [--domain slug.orangecat.ch] [--db dbname|-] [--port N]
#
# Examples:
#   provision-site.sh hamstercheek --repo /home/g/dev/hamstercheek
#   provision-site.sh prime-tower --repo /home/g/dev/prime-tower --domain prime-tower.orangecat.ch
#   provision-site.sh demo-cafe --repo /home/g/dev/demo-cafe --db demo_cafe
#
# After provisioning:
#   1. Add DNS A record → 167.233.22.31 (Infomaniak orangecat.ch zone)
#   2. bash gen-env.sh <slug>
#   3. bash deploy.sh <slug> [--env]   (first deploy uploads env if --env)
#   4. Commit deploy.yml shim to the app repo (see docs/infrastructure/self-host-cd.md)
#
# Optional import before scaffold:
#   npx tsx scripts/site-import/import-site.ts https://prospect.example --out imports/<slug>.json
#
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"
. "$HERE/_box-env.sh"

SLUG="${1:?usage: provision-site.sh <slug> --repo <path> [--domain ...] [--db ...] [--port ...]}"
shift

REPO=""
DOMAIN=""
DB="-"
PORT=""

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO="${2:?}"; shift 2 ;;
    --domain) DOMAIN="${2:?}"; shift 2 ;;
    --db) DB="${2:?}"; shift 2 ;;
    --port) PORT="${2:?}"; shift 2 ;;
    *) echo "ERROR: unknown arg $1" >&2; exit 1 ;;
  esac
done

[ -n "$REPO" ] || { echo "ERROR: --repo required" >&2; exit 1; }
[ -d "$REPO" ] || { echo "ERROR: repo path missing: $REPO" >&2; exit 1; }

DOMAIN="${DOMAIN:-${SLUG}.orangecat.ch}"

if grep -v '^#' "$MANIFEST" | grep -q "^${SLUG}|"; then
  echo "ERROR: '$SLUG' already in apps.conf" >&2
  exit 1
fi

if [ -z "$PORT" ]; then
  # Next free port above the highest apps.conf entry (excluding 4001–4004 legacy).
  PORT=$(grep -v '^#' "$MANIFEST" | cut -d'|' -f2 | sort -n | tail -1)
  PORT=$((PORT + 1))
  [ "$PORT" -lt 4005 ] && PORT=4005
fi

APP_DIR="."
if [ -f "$REPO/package.json" ] && grep -q '"next"' "$REPO/package.json" 2>/dev/null; then
  APP_DIR="."
elif [ -d "$REPO/apps/web" ]; then
  APP_DIR="apps/web"
elif [ -d "$REPO/frontend" ]; then
  APP_DIR="frontend"
elif [ -d "$REPO/app" ]; then
  APP_DIR="app"
fi

LINE="${SLUG}|${PORT}|${DOMAIN}|${REPO}|${APP_DIR}|${DB}"
echo "=== provision $SLUG ==="
echo "  domain:  $DOMAIN"
echo "  port:    $PORT"
echo "  repo:    $REPO"
echo "  app_dir: $APP_DIR"
echo "  db:      $DB"
echo ""
echo "Adding to apps.conf:"
echo "  $LINE"

printf '%s\n' "$LINE" >> "$MANIFEST"

echo ""
echo "=== sync-infra ==="
bash "$HERE/sync-infra.sh" "$SLUG"

echo ""
cat <<EOF
=== CHECKLIST (manual steps) ===

DNS (Infomaniak orangecat.ch zone):
  ${DOMAIN}  A  ${HETZNER_IP}

Runtime env:
  bash $HERE/gen-env.sh $SLUG
  # Edit secrets on box: /opt/${SLUG}/shared/.env

First deploy:
  bash $HERE/deploy.sh $SLUG --env

GitHub CD (in $REPO):
  gh secret set HETZNER_SSH_PRIVATE_KEY -R <owner>/<repo> < ~/.ssh/fleetcrown_ci_deploy
  # Add .github/workflows/deploy.yml — see docs/infrastructure/self-host-cd.md

Optional site import:
  npx tsx $HERE/../site-import/import-site.ts https://<prospect-site> --out imports/${SLUG}.json

Project brief:
  bitbaum/projects/${SLUG}.md

Discipline:
  docs/standards/fleet-discipline.md

EOF
