#!/usr/bin/env bash
#
# Spin up a new site: repo → register → box → deploy. One command.
#
#   new-site.sh <slug> [--title "Name"] [--owner X] [--kind K] [--status S]
#               [--public] [--no-deploy] [--dry-run]
#
# WHY THIS EXISTS
#
# Substrata was created by hand on 2026-08-27. It took nine steps, and the two
# that got skipped when the same thing was done for Camille a week earlier were
# the two with no visible payoff on the day: creating the repository, and
# registering it. Camille then ran in production for eight days with no version
# control and no entry in apps.conf, which meant the studio's central claim —
# that a client can be handed their site — was untestable for the very site
# built to demonstrate it.
#
# So this automates the boring steps specifically. The interesting ones (design,
# content) are meant to be done by a human afterwards.
#
# WHAT IT DOES NOT DO
#
#   - It does not set HETZNER_SSH_PRIVATE_KEY on the new repo. That secret is
#     what lets CD reach the box, and handling a private key is the operator's
#     job, not a script's. It prints the command. Better still: put a
#     self-hosted Actions runner on the box and the secret stops existing.
#   - It creates the FleetCrown project and widget token (provision-widget.ts),
#     but treats failure as non-fatal: a site without a widget is fixable in a
#     minute, whereas aborting halfway leaves a half-registered site on the box.
#
# Every step is idempotent or refuses. Nothing is clobbered.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
source "$HERE/lib.sh"

SLUG=""; TITLE=""; OWNER="bitbaum"; KIND="client-site"; STATUS="prospect"
VISIBILITY="--private"; DEPLOY=1; DRY=0
DEV_ROOT="${DEV_ROOT:-/home/g/dev}"
GH_OWNER="${GH_OWNER:-maonakamoto}"
BASE_DOMAIN="orangecat.ch"

while [ $# -gt 0 ]; do
  case "$1" in
    --title)  TITLE="$2"; shift 2 ;;
    --owner)  OWNER="$2"; shift 2 ;;
    --kind)   KIND="$2"; shift 2 ;;
    --status) STATUS="$2"; shift 2 ;;
    --public) VISIBILITY="--public"; shift ;;
    --no-deploy) DEPLOY=0; shift ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    -*) echo "unknown flag: $1" >&2; exit 2 ;;
    *)  [ -z "$SLUG" ] && SLUG="$1" || { echo "unexpected arg: $1" >&2; exit 2; }; shift ;;
  esac
done

[ -n "$SLUG" ] || { echo "usage: new-site.sh <slug> [--title \"Name\"]" >&2; exit 2; }
[ -n "$TITLE" ] || TITLE="$SLUG"

say() { printf '  %s\n' "$*"; }
run() { if [ "$DRY" = 1 ]; then printf '  DRY  %s\n' "$*"; else eval "$@"; fi; }

# ---------------------------------------------------------------- validation
# A slug becomes a DNS label, a certificate subject, a directory and a systemd
# unit. Everything downstream assumes it is safe, so it is checked once, here.
echo "→ validating '$SLUG'"
[[ "$SLUG" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]] \
  || { echo "✗ slug must be lowercase letters, digits and hyphens, not starting or ending with one" >&2; exit 1; }

if grep -q "^$SLUG|" "$MANIFEST" 2>/dev/null; then
  echo "✗ '$SLUG' is already in $MANIFEST" >&2; exit 1
fi

# A label already serving something on the box must never be reused: the new
# site would either be shadowed by that Caddy block or shadow it.
if grep -v '^#' "$MANIFEST" | cut -d'|' -f3 | tr ',' '\n' | grep -qx "$SLUG.$BASE_DOMAIN"; then
  echo "✗ $SLUG.$BASE_DOMAIN is already served by another entry" >&2; exit 1
fi
for reserved in www api app admin support security billing pay wallet login auth account \
                mail smtp imap ns1 ns2 mx cdn static assets vpn db status staging dev test \
                preview bridge fleetcrown orangecat supabase solon evig revampit root system; do
  [ "$SLUG" = "$reserved" ] && { echo "✗ '$SLUG' is reserved (infrastructure or impersonation risk)" >&2; exit 1; }
done

REPO_DIR="$DEV_ROOT/$SLUG"
[ -e "$REPO_DIR" ] && { echo "✗ $REPO_DIR already exists" >&2; exit 1; }

# ------------------------------------------------------------ port allocation
# From the register, not from `ss -ltnp`. The register is the SSOT; a port that
# is free on the box but claimed here belongs to something not currently running.
PORT=$(grep -v '^#' "$MANIFEST" | cut -d'|' -f2 | grep -E '^[0-9]+$' | sort -n | tail -1)
PORT=$((PORT + 1))
say "port $PORT (next after the highest in the register)"
say "host $SLUG.$BASE_DOMAIN  (wildcard DNS — no record needed)"
say "repo $GH_OWNER/$SLUG  ->  $REPO_DIR"

# ------------------------------------------------------------------- scaffold
echo "→ scaffolding"
TEMPLATE="$HERE/../site-template"
if [ "$DRY" = 0 ]; then
  mkdir -p "$REPO_DIR"
  cp -r "$TEMPLATE"/. "$REPO_DIR"/
  mv "$REPO_DIR/gitignore" "$REPO_DIR/.gitignore"
  # Placeholders are substituted in every text file, so a template file can use
  # them without this script knowing which files exist.
  grep -rl '__SLUG__\|__TITLE__\|__HOST__' "$REPO_DIR" 2>/dev/null | while read -r f; do
    sed -i "s|__SLUG__|$SLUG|g; s|__TITLE__|$TITLE|g; s|__HOST__|$SLUG.$BASE_DOMAIN|g" "$f"
  done
  printf '# Runtime env. No secrets belong here — the box is the env SSOT.\nNODE_ENV=production\nNEXT_PUBLIC_APP_URL=https://%s.%s\n' "$SLUG" "$BASE_DOMAIN" > "$REPO_DIR/.env.selfhost.local"
  say "$(find "$REPO_DIR" -type f | wc -l) files"
else
  say "DRY  would copy $TEMPLATE -> $REPO_DIR and substitute __SLUG__/__TITLE__/__HOST__"
fi

# ------------------------------------------------------------------- widget
# Before the repository, so the token is in the first commit's env file rather
# than arriving as an afterthought nobody deploys.
#
# NON-FATAL BY DESIGN. A site without a widget can be fixed in a minute; a
# scaffold that aborts here leaves a directory, no repo and no register entry,
# which is the mess this script exists to prevent.
echo "→ FleetCrown project + widget token"
WIDGET_TOKEN=""
if [ "$DRY" = 1 ]; then
  say "DRY  npx tsx $HERE/../provision-widget.ts $SLUG '$TITLE' $SLUG.$BASE_DOMAIN"
else
  WIDGET_TOKEN=$(cd "$HERE/../.." && npx tsx scripts/provision-widget.ts "$SLUG" "$TITLE" "$SLUG.$BASE_DOMAIN" 2>/dev/null || true)
  if [ -n "$WIDGET_TOKEN" ]; then
    printf 'NEXT_PUBLIC_FC_WIDGET_TOKEN=%s\n' "$WIDGET_TOKEN" >> "$REPO_DIR/.env.selfhost.local"
    say "token provisioned and written to .env.selfhost.local"
  else
    say "⚠ could not provision a widget token (needs the FleetCrown database)."
    say "  The site is fine; wire it later with:"
    say "    npx tsx scripts/provision-widget.ts $SLUG '$TITLE' $SLUG.$BASE_DOMAIN"
  fi
fi

# ----------------------------------------------------------------- repository
# Before anything else reaches the box. A site that is not in a repository
# cannot be handed to anyone, and that is the step that gets skipped.
echo "→ repository"
run "cd '$REPO_DIR' && git init -q && git add -A && git -c user.name='Mao Nakamoto' -c user.email='georgy.butaev@revamp-it.ch' commit -q -m 'feat: scaffold $TITLE' && git branch -M main"
run "cd '$REPO_DIR' && gh repo create '$GH_OWNER/$SLUG' $VISIBILITY --source=. --remote=origin --push"

# ------------------------------------------------------------------- register
echo "→ register"
LINE="$SLUG|$PORT|$SLUG.$BASE_DOMAIN|$REPO_DIR|.|-|$OWNER|$KIND|$STATUS|-|-|$(date -u +%Y-%m-%d)"
if [ "$DRY" = 1 ]; then say "DRY  append: $LINE"; else
  printf '%s\n' "$LINE" >> "$MANIFEST"
  say "appended to $MANIFEST"
fi

# ------------------------------------------------------------------------ box
echo "→ box (systemd unit, launch.sh, Caddy vhost, monitoring)"
run "bash '$HERE/sync-infra.sh' '$SLUG'"

# --------------------------------------------------------------------- deploy
if [ "$DEPLOY" = 1 ]; then
  echo "→ deploy"
  run "bash '$HERE/deploy.sh' '$SLUG'"
fi

# ----------------------------------------------------------------------- next
cat <<NEXT

✓ $TITLE

  live      https://$SLUG.$BASE_DOMAIN
  repo      https://github.com/$GH_OWNER/$SLUG
  register  $SLUG|$PORT|... in apps.conf

  Still yours to do:

  1. CD needs the deploy key on the new repo — a script does not handle
     private keys:
       gh secret set HETZNER_SSH_PRIVATE_KEY --repo $GH_OWNER/$SLUG < <your key>

  2. Change app/globals.css. Shipping in the default palette is the one thing
     a bespoke site must not do.

  3. Commit the register change:
       cd $(dirname "$MANIFEST") && git add apps.conf && git commit
NEXT
