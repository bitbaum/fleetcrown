#!/usr/bin/env bash
#
# Register an ALREADY-EXISTING GitHub repo for Hetzner CD.
#
#   register-site.sh <slug> --repo OWNER/NAME [--title "Name"]
#                     [--owner X] [--kind K] [--status S]
#                     [--plan P] [--price N]
#                     [--no-deploy] [--dry-run]
#
# This is the CD half of new-site.sh without scaffolding a new repo.
# FleetCrown kickoff / provision creates the GitHub repo (agent starters);
# this script does what Make it happen could not safely invent: apps.conf
# row, deploy secret, sync-infra, and (unless --no-deploy) first deploy.
#
# Idempotent where possible: existing apps.conf row with the same slug refuses;
# deploy.yml is added only when missing; secret set is overwrite-safe.
#
# Prints the live URL on success (and always ends with a summary block).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
source "$HERE/lib.sh"

SECRET_OK=0
SLUG=""; REPO_REF=""; TITLE=""; OWNER="bitbaum"; KIND="client-site"; STATUS="prospect"
DEPLOY=1; DRY=0
PLAN="-"; PRICE="-"
BASE_DOMAIN="$SITES_BASE_DOMAIN"
# Prefer the durable studio checkout for apps.conf — writing the /opt release
# copy is lost on the next fleetcrown deploy.
FC_REPO="${FLEETCROWN_REPO_ROOT:-$DEV_ROOT/fleetcrown}"
if [ -f "$FC_REPO/scripts/hetzner/apps.conf" ]; then
  MANIFEST="$FC_REPO/scripts/hetzner/apps.conf"
  SYNC_INFRA="$FC_REPO/scripts/hetzner/sync-infra.sh"
  DEPLOY_SH="$FC_REPO/scripts/hetzner/deploy.sh"
else
  # Release /opt copy, or a checkout that only has the script beside apps.conf.
  # Prefer durable FC_REPO when present; never leave MANIFEST unset.
  MANIFEST="$HERE/apps.conf"
  SYNC_INFRA="$HERE/sync-infra.sh"
  DEPLOY_SH="$HERE/deploy.sh"
fi
[ -f "$MANIFEST" ] || { echo "✗ apps.conf missing at $MANIFEST (set FLEETCROWN_REPO_ROOT to the durable fleetcrown checkout)" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --repo)   REPO_REF="$2"; shift 2 ;;
    --title)  TITLE="$2"; shift 2 ;;
    --owner)  OWNER="$2"; shift 2 ;;
    --kind)   KIND="$2"; shift 2 ;;
    --status) STATUS="$2"; shift 2 ;;
    --plan)   PLAN="$2"; shift 2 ;;
    --price)  PRICE="$2"; shift 2 ;;
    --no-deploy) DEPLOY=0; shift ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    -*) echo "unknown flag: $1" >&2; exit 2 ;;
    *)  [ -z "$SLUG" ] && SLUG="$1" || { echo "unexpected arg: $1" >&2; exit 2; }; shift ;;
  esac
done

[ -n "$SLUG" ] || { echo "usage: register-site.sh <slug> --repo OWNER/NAME" >&2; exit 2; }
[ -n "$REPO_REF" ] || { echo "usage: register-site.sh <slug> --repo OWNER/NAME" >&2; exit 2; }
[ -n "$TITLE" ] || TITLE="$SLUG"

case "$KIND" in
  client-app|client-site)
    if [ "$STATUS" = live ] && { [ "$PLAN" = "-" ] || [ "$PRICE" = "-" ]; }; then
      echo "✗ --status live on $KIND needs --plan and --price." >&2
      exit 2
    fi
    ;;
esac

say() { printf '  %s\n' "$*"; }
run() { if [ "$DRY" = 1 ]; then printf '  DRY  %s\n' "$*"; else eval "$@"; fi; }

# Normalize OWNER/NAME from a URL if needed.
if [[ "$REPO_REF" == https://github.com/* ]] || [[ "$REPO_REF" == git@github.com:* ]]; then
  REPO_REF=$(printf '%s' "$REPO_REF" | sed -E 's#^https://github.com/##; s#^git@github.com:##; s#\.git$##')
fi
GH_REPO="$REPO_REF"

echo "→ validating '$SLUG'"
[[ "$SLUG" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]] \
  || { echo "✗ slug must be lowercase letters, digits and hyphens, not starting or ending with one" >&2; exit 1; }

if grep -q "^$SLUG|" "$MANIFEST" 2>/dev/null; then
  # Idempotent: kickoff retry / Register site after a prior successful register.
  say "'$SLUG' already in $MANIFEST — treating as registered"
  cat <<NEXT

✓ $TITLE already registered for CD

  live      https://$SLUG.$BASE_DOMAIN
  repo      https://github.com/$GH_REPO
  register  existing row in $MANIFEST

NEXT
  exit 0
fi

if grep -v '^#' "$MANIFEST" | cut -d'|' -f3 | tr ',' '\n' | grep -qx "$SLUG.$BASE_DOMAIN"; then
  echo "✗ $SLUG.$BASE_DOMAIN is already served by another entry" >&2; exit 1
fi
for reserved in www api app admin support security billing pay wallet login auth account \
                mail smtp imap ns1 ns2 mx cdn static assets vpn db status staging dev test \
                preview bridge fleetcrown orangecat supabase solon evig revampit root system; do
  [ "$SLUG" = "$reserved" ] && { echo "✗ '$SLUG' is reserved (infrastructure or impersonation risk)" >&2; exit 1; }
done

REPO_DIR="$DEV_ROOT/$SLUG"
PORT=$(grep -v '^#' "$MANIFEST" | cut -d'|' -f2 | grep -E '^[0-9]+$' | sort -n | tail -1)
PORT=$((PORT + 1))
say "port $PORT (next after the highest in the register)"
say "host $SLUG.$BASE_DOMAIN"
say "repo $GH_REPO  ->  $REPO_DIR"
say "manifest $MANIFEST"

# ----------------------------------------------------------------- checkout
echo "→ checkout"
if [ -e "$REPO_DIR" ]; then
  say "exists $REPO_DIR — leaving contents alone"
else
  run "gh repo clone '$GH_REPO' '$REPO_DIR'"
fi

# --------------------------------------------------------------- deploy.yml
echo "→ deploy.yml"
DEPLOY_YML="$REPO_DIR/.github/workflows/deploy.yml"
if [ -f "$DEPLOY_YML" ]; then
  say "already present"
else
  if [ "$DRY" = 1 ]; then
    say "DRY  would write $DEPLOY_YML and push"
  else
    mkdir -p "$(dirname "$DEPLOY_YML")"
    cat > "$DEPLOY_YML" <<YML
name: Deploy

on:
  workflow_dispatch: {}
  push:
    branches: [main]

jobs:
  deploy:
    uses: ${WORKFLOW_OWNER}/fleetcrown/.github/workflows/selfhost-deploy.yml@main
    with:
      app: ${SLUG}
    secrets: inherit
YML
    (
      cd "$REPO_DIR"
      git add .github/workflows/deploy.yml
      if git diff --cached --quiet; then
        true
      else
        git -c user.name='Cato' -c user.email='catomean@users.noreply.github.com' \
          commit -m "chore: add self-host deploy shim for $SLUG"
        git push -u origin HEAD
      fi
    )
    say "committed and pushed deploy.yml"
  fi
fi

# ----------------------------------------------------------------- ci secret
echo "→ ci secret"
if [ "$DRY" = 1 ]; then
  say "DRY  gh secret set HETZNER_SSH_PRIVATE_KEY --repo $GH_REPO < $DEPLOY_KEY_PATH"
elif [ ! -r "$DEPLOY_KEY_PATH" ]; then
  SECRET_OK=0
  say "no key at $DEPLOY_KEY_PATH — CD will not reach the box."
elif gh secret set HETZNER_SSH_PRIVATE_KEY --repo "$GH_REPO" < "$DEPLOY_KEY_PATH" 2>/dev/null; then
  SECRET_OK=1
  say "HETZNER_SSH_PRIVATE_KEY set on $GH_REPO"
else
  SECRET_OK=0
  say "could not set the secret (gh auth?) — CD will not reach the box until it is set."
fi

# ------------------------------------------------------------------- register
echo "→ register"
LINE="$SLUG|$PORT|$SLUG.$BASE_DOMAIN|$REPO_DIR|.|-|$OWNER|$KIND|$STATUS|$PLAN|$PRICE|$(date -u +%Y-%m-%d)"
if [ "$DRY" = 1 ]; then say "DRY  append: $LINE"; else
  printf '%s\n' "$LINE" >> "$MANIFEST"
  say "appended to $MANIFEST"
fi

# ------------------------------------------------------------------------ box
echo "→ box (systemd unit, launch.sh, Caddy vhost, monitoring)"
run "bash '$SYNC_INFRA' '$SLUG'"

# --------------------------------------------------------------------- deploy
if [ "$DEPLOY" = 1 ]; then
  echo "→ deploy"
  run "bash '$DEPLOY_SH' '$SLUG'" || say "⚠ first deploy failed — URL is registered; fix the app and push (or re-run deploy.sh)"
fi

# ----------------------------------------------------------------------- next
if   [ "$DRY" = 1 ];      then SECRET_OK_LABEL="would be set from $DEPLOY_KEY_PATH"
elif [ "$SECRET_OK" = 1 ]; then SECRET_OK_LABEL="set — push deploys"
else                            SECRET_OK_LABEL="NOT set — CD cannot reach the box"; fi
cat <<NEXT

✓ $TITLE registered for CD

  live      https://$SLUG.$BASE_DOMAIN
  repo      https://github.com/$GH_REPO
  register  $SLUG|$PORT|... in apps.conf

  ci        deploy key ${SECRET_OK_LABEL}

  Still yours to do:

  1. Commit the register change in the fleetcrown checkout:
       cd $(dirname "$MANIFEST")/../.. && git add scripts/hetzner/apps.conf && git commit

  2. If first deploy failed, fix the app until \`next build\` works, then push main.
NEXT
