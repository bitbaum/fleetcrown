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
# Idempotent: existing apps.conf row with the same slug (compatible repo path)
# succeeds — re-ensures deploy.yml + secret + sync-infra, prints live URL, does
# not fail as "already exists". deploy.yml is added/repaired when missing;
# secret set is overwrite-safe.
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
  SYNC_INFRA="$HERE/sync-infra.sh"
  DEPLOY_SH="$HERE/deploy.sh"
else
  # Release /opt copy, or a checkout that only has the script beside apps.conf.
  # Prefer durable FC_REPO when present; never leave MANIFEST unset.
  MANIFEST="$HERE/apps.conf"
  SYNC_INFRA="$HERE/sync-infra.sh"
  DEPLOY_SH="$HERE/deploy.sh"
fi
[ -f "$MANIFEST" ] || { echo "✗ scripts/hetzner/apps.conf missing at $MANIFEST (set FLEETCROWN_REPO_ROOT to the durable fleetcrown checkout)" >&2; exit 1; }
# The register beside this script is the one main last shipped. The durable
# checkout can lag main (rows land there only on a pull nobody triggers) and
# main can lag the durable checkout (rows appended here reach main only when
# someone commits them). Ports are allocated and conflicts checked against
# BOTH, or a port main already gave away gets handed out again — velokiosk
# took 4024 on 2026-09-10 while diplodoctor was listening on it.
RELEASE_MANIFEST="$HERE/apps.conf"
registers() { printf '%s\n' "$MANIFEST"; [ "$RELEASE_MANIFEST" != "$MANIFEST" ] && [ -f "$RELEASE_MANIFEST" ] && printf '%s\n' "$RELEASE_MANIFEST"; return 0; }

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
# Child tools must read the exact canonical register we update, even when the
# executable comes from the current release and the register is durable.
export MANIFEST
if [ "$DRY" != 1 ]; then
  exec 9>"${TMPDIR:-/tmp}/fleetcrown-register-site.lock"
  flock -w 60 -x 9 || { echo "ERROR: another registration is still running; retry shortly" >&2; exit 1; }
fi

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
# The register is a file in git; a row that exists only on this box is lost to
# the next clone and invisible to CI's uniqueness check. Send it to main the
# way every other change gets there: a branch, a PR, the sweep. Best-effort —
# the site is registered here either way — but always announced.
publish_register_row() {
  local line="$1" fc_git wt branch
  fc_git="$(dirname "$(dirname "$(dirname "$MANIFEST")")")"
  git -C "$fc_git" rev-parse --is-inside-work-tree >/dev/null 2>&1 || { say "register row not published: $fc_git is not a git checkout"; return 0; }
  branch="register/$SLUG"
  wt="$(mktemp -d)/fc"
  if git -C "$fc_git" fetch -q origin main 2>/dev/null \
     && git -C "$fc_git" worktree add -q -B "$branch" "$wt" origin/main 2>/dev/null; then
    if grep -q "^$SLUG|" "$wt/scripts/hetzner/apps.conf"; then
      say "register row already on main"
    else
      printf '%s\n' "$line" >> "$wt/scripts/hetzner/apps.conf"
      if git -C "$wt" -c user.name='Cato' -c user.email='catomean@users.noreply.github.com' \
           commit -q -am "chore(register): add $SLUG ($PORT)" \
         && env -u GH_TOKEN -u GITHUB_TOKEN git -C "$wt" push -q -f -u origin "$branch" 2>/dev/null \
         && pr=$(env -u GH_TOKEN -u GITHUB_TOKEN gh pr create --repo "$(git -C "$fc_git" remote get-url origin | sed -E 's#^https://github.com/##; s#^git@github.com:##; s#\.git$##')" \
                 --head "$branch" --base main --title "chore(register): add $SLUG ($PORT)" \
                 --body "Registered from the box by register-site.sh. Row: \`$line\`" 2>/dev/null); then
        say "register row sent to main: $pr"
      else
        say "⚠ register row not published to main (push or PR failed) — the durable register still has it"
      fi
    fi
    git -C "$fc_git" worktree remove -f "$wt" >/dev/null 2>&1 || true
  else
    say "⚠ register row not published to main (could not fetch or branch)"
  fi
  rm -rf "$(dirname "$wt")"
  return 0
}

# Normalize OWNER/NAME from a URL if needed.
if [[ "$REPO_REF" == https://github.com/* ]] || [[ "$REPO_REF" == git@github.com:* ]]; then
  REPO_REF=$(printf '%s' "$REPO_REF" | sed -E 's#^https://github.com/##; s#^git@github.com:##; s#\.git$##')
fi
GH_REPO="$REPO_REF"
[[ "$GH_REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { echo "invalid GitHub repository" >&2; exit 2; }

echo "→ validating '$SLUG'"
[[ "$SLUG" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]] \
  || { echo "✗ slug must be lowercase letters, digits and hyphens, not starting or ending with one" >&2; exit 1; }

# Adopt main's register when every local row is already on main: the durable
# checkout is then a stale copy, not a holder of unpublished rows. If it does
# hold rows main lacks (a register PR still open), leave it — the allocation
# below reads both registers anyway.
FC_GIT="$(dirname "$(dirname "$(dirname "$MANIFEST")")")"
if [ "$DRY" != 1 ] && git -C "$FC_GIT" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
   && git -C "$FC_GIT" fetch -q origin main 2>/dev/null; then
  # Keyed on the slug, not the full row: main edits plan/price columns of
  # existing rows, and a row-for-row comparison then reported "unpublished"
  # forever, so the durable checkout never followed main (2026-09-11).
  unpublished=$(comm -23 <(grep -v '^#' "$MANIFEST" | grep . | cut -d'|' -f1 | sort) \
                         <(git -C "$FC_GIT" show origin/main:scripts/hetzner/apps.conf 2>/dev/null | grep -v '^#' | grep . | cut -d'|' -f1 | sort))
  if [ -z "$unpublished" ]; then
    git -C "$FC_GIT" checkout -q -- scripts/hetzner/apps.conf 2>/dev/null || true
    if git -C "$FC_GIT" merge -q --ff-only origin/main 2>/dev/null; then
      say "durable register fast-forwarded to origin/main ($(git -C "$FC_GIT" rev-parse --short HEAD))"
    else
      say "durable register not fast-forwarded (local changes beyond the register) — allocating against both registers"
    fi
  else
    say "durable register holds $(printf '%s\n' "$unpublished" | grep -c .) row(s) not yet on main — keeping it"
  fi
fi

ALREADY=0
EXISTING_LINE=""
if EXISTING_LINE=$(grep "^$SLUG|" "$MANIFEST" 2>/dev/null); then
  # Idempotent: Register site / kickoff retry after apps.conf was written earlier.
  existing_dir=$(printf '%s' "$EXISTING_LINE" | cut -d'|' -f4)
  existing_base=$(basename "$existing_dir")
  repo_name="${GH_REPO##*/}"
  if [ "$existing_base" != "$SLUG" ] && [ "$existing_base" != "$repo_name" ]; then
    echo "✗ '$SLUG' already in scripts/hetzner/apps.conf but repo path '$existing_dir' is incompatible with --repo $GH_REPO" >&2
    exit 1
  fi
  ALREADY=1
  REPO_DIR="$existing_dir"
  PORT=$(printf '%s' "$EXISTING_LINE" | cut -d'|' -f2)
  say "'$SLUG' already in scripts/hetzner/apps.conf — re-ensuring deploy.yml, secret, sync-infra"
else
  if cat $(registers) | grep -v '^#' | cut -d'|' -f3 | tr ',' '\n' | grep -qx "$SLUG.$BASE_DOMAIN"; then
    echo "✗ $SLUG.$BASE_DOMAIN is already served by another entry" >&2; exit 1
  fi
  if grep -q "^$SLUG|" "$RELEASE_MANIFEST" 2>/dev/null; then
    echo "✗ '$SLUG' is registered on main but not in the durable register at $MANIFEST — pull it before registering" >&2; exit 1
  fi
  for reserved in www api app admin support security billing pay wallet login auth account \
                  mail smtp imap ns1 ns2 mx cdn static assets vpn db status staging dev test \
                  preview bridge fleetcrown orangecat supabase solon evig revampit root system; do
    [ "$SLUG" = "$reserved" ] && { echo "✗ '$SLUG' is reserved (infrastructure or impersonation risk)" >&2; exit 1; }
  done
  REPO_DIR="$DEV_ROOT/$SLUG"
  PORT=$(cat $(registers) | grep -v '^#' | cut -d'|' -f2 | grep -E '^[0-9]+$' | sort -n | tail -1)
  PORT=$((PORT + 1))
fi
say "port $PORT$([ "$ALREADY" = 1 ] && echo ' (existing)' || echo ' (next after the highest in either register)')"
say "host $SLUG.$BASE_DOMAIN"
say "repo $GH_REPO  ->  $REPO_DIR"
say "manifest $MANIFEST"

# ----------------------------------------------------------------- checkout
echo "→ checkout"
if [ -e "$REPO_DIR" ]; then
  actual_repo=$(git -C "$REPO_DIR" remote get-url origin | sed -E 's#^https://github.com/##; s#^git@github.com:##; s#\.git$##')
  [ "$actual_repo" = "$GH_REPO" ] || { echo "ERROR: existing checkout belongs to another repository" >&2; exit 1; }
  say "exists $REPO_DIR — leaving contents alone"
else
  run "gh repo clone '$GH_REPO' '$REPO_DIR'"
fi

# ------------------------------------------------------------- runtime env
# Before the shim: pushing deploy.yml to main starts the site's first Deploy
# at once, and that job pulls /opt/<slug>/shared/.env from the box. Written
# after sync-infra, the env did not exist yet and velokiosk-sep10's first
# Deploy failed on "no runtime .env found" (2026-09-10). Never overwrites an
# existing environment.
echo "→ runtime env"
if [ "$DRY" = 1 ]; then
  say "DRY  would ensure /opt/$SLUG/shared/.env (NODE_ENV=production, PORT=$PORT)"
else
  box "sudo mkdir -p /opt/$SLUG/shared && sudo chown -R ubuntu:ubuntu /opt/$SLUG
    if [ ! -f /opt/$SLUG/shared/.env ]; then
      if [ -f /opt/$SLUG/app/.env ]; then cp -p /opt/$SLUG/app/.env /opt/$SLUG/shared/.env
      else (umask 077; printf 'NODE_ENV=production\nPORT=$PORT\n' > /opt/$SLUG/shared/.env); fi
    fi"
  say "/opt/$SLUG/shared/.env present"
fi

# --------------------------------------------------------------- deploy.yml
echo "→ deploy.yml"
DEPLOY_YML="$REPO_DIR/.github/workflows/deploy.yml"
write_deploy_yml() {
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
    secrets:
      HETZNER_SSH_PRIVATE_KEY: \${{ secrets.HETZNER_SSH_PRIVATE_KEY }}
YML
}
# Writes the shim to the remote through whichever identity may. The caller's
# token (GH_TOKEN from register-cd is the user's OAuth grant) needs the
# `workflow` scope to touch .github/workflows/*; grants issued before that
# scope was requested cannot, and the push is refused. This host's own gh
# login is the studio's and has it, so it is the fallback — announced, never
# assumed. A shim that is not on the remote is fatal: without it there is no
# Deploy, and "registered" would be a lie.
# ci.yml + auto-merge.yml come from scripts/site-template (the ONE copy every
# new site gets from new-site.sh). A kickoff starter arrives without them, so
# every PR an agent opened on it waited for a human merge. Written only when
# the file is missing locally; pushed with the shim through whichever identity
# may write workflows.
SITE_TEMPLATE_WF="$HERE/../site-template/.github/workflows"
write_sidecar_workflows() {
  local f
  for f in ci.yml auto-merge.yml; do
    [ -f "$REPO_DIR/.github/workflows/$f" ] && continue
    [ -f "$SITE_TEMPLATE_WF/$f" ] || { say "⚠ site-template has no $f — skipping"; continue; }
    mkdir -p "$REPO_DIR/.github/workflows"
    sed "s|__SLUG__|$SLUG|g; s|__WORKFLOW_OWNER__|$WORKFLOW_OWNER|g" "$SITE_TEMPLATE_WF/$f" > "$REPO_DIR/.github/workflows/$f"
    say "wrote $f from site-template"
  done
}
push_deploy_yml() {
  local msg="$1"
  write_sidecar_workflows
  (
    cd "$REPO_DIR"
    git add .github/workflows
    if git diff --cached --quiet; then
      true
    else
      git -c user.name='Cato' -c user.email='catomean@users.noreply.github.com' \
        commit -m "$msg"
      # Contents API / another register may have landed the same fix first.
      if ! git push -u origin HEAD 2>/dev/null; then
        git fetch origin HEAD 2>/dev/null || git fetch origin
        if git pull --rebase --autostash origin HEAD 2>/dev/null \
          || git pull --rebase --autostash origin main 2>/dev/null; then
          git push -u origin HEAD 2>/dev/null || say "⚠ caller identity could not push deploy.yml — trying this host's gh login"
        else
          say "⚠ deploy.yml commit kept local; remote already has a newer shim — continuing"
        fi
      fi
    fi
  )
  local f
  for f in deploy.yml ci.yml auto-merge.yml; do
    [ -f "$REPO_DIR/.github/workflows/$f" ] || continue
    workflow_on_remote "$f" || put_workflow_as_host "$f" "$msg"
  done
  shim_on_remote || { echo "ERROR: deploy.yml is not on $GH_REPO — no identity available here may write workflows" >&2; exit 1; }
  for f in ci.yml auto-merge.yml; do
    workflow_on_remote "$f" || say "⚠ $f is not on $GH_REPO — agent PRs on this site will wait for a human merge"
  done
}
workflow_on_remote() {
  env -u GH_TOKEN -u GITHUB_TOKEN gh api "repos/$GH_REPO/contents/.github/workflows/$1" --jq .sha >/dev/null 2>&1 \
    || gh api "repos/$GH_REPO/contents/.github/workflows/$1" --jq .sha >/dev/null 2>&1
}
put_workflow_as_host() {
  local f="$1" msg="$2" sha
  sha=$(env -u GH_TOKEN -u GITHUB_TOKEN gh api "repos/$GH_REPO/contents/.github/workflows/$f" --jq .sha 2>/dev/null || true)
  if env -u GH_TOKEN -u GITHUB_TOKEN gh api -X PUT "repos/$GH_REPO/contents/.github/workflows/$f" \
       -f message="$msg" -f branch=main -f content="$(base64 -w0 < "$REPO_DIR/.github/workflows/$f")" ${sha:+-f sha="$sha"} >/dev/null 2>&1; then
    say "$f written by this host's gh login ($(env -u GH_TOKEN -u GITHUB_TOKEN gh api user --jq .login 2>/dev/null || echo '?'))"
    ( cd "$REPO_DIR" && git fetch -q origin && git reset -q --hard origin/main 2>/dev/null || true )
  else
    say "⚠ this host's gh login could not write $f either"
  fi
}
shim_on_remote() { workflow_on_remote deploy.yml; }
if [ -f "$DEPLOY_YML" ] && grep -q 'secrets: inherit' "$DEPLOY_YML" 2>/dev/null; then
  # Cross-owner callers (e.g. catomean/* → bitbaum/fleetcrown) cannot inherit.
  if [ "$DRY" = 1 ]; then
    say "DRY  would repair secrets: inherit → explicit HETZNER_SSH_PRIVATE_KEY"
  else
    write_deploy_yml
    push_deploy_yml "fix: pass HETZNER_SSH_PRIVATE_KEY explicitly for cross-owner deploy"
    say "repaired deploy.yml secrets mapping (push best-effort)"
  fi
elif [ -f "$DEPLOY_YML" ] && { [ "$DRY" = 1 ] || shim_on_remote; }; then
  say "already present"
  # An existing site may predate the sidecars (ci.yml, auto-merge.yml).
  [ "$DRY" = 1 ] || push_deploy_yml "ci: verify and auto-merge (seeded by FleetCrown register)"
elif [ -f "$DEPLOY_YML" ]; then
  # The clone has it, the remote does not: a push the caller's token could not
  # make (no `workflow` scope) left a local commit behind. The file being on
  # disk here proves nothing about GitHub — velokiosk-sep10 sat "already
  # present" through two registrations while every GET said the workflow was
  # missing. Re-push through push_deploy_yml, which verifies the remote.
  push_deploy_yml "chore: add self-host deploy shim for $SLUG"
  say "deploy.yml was local only — now on the remote"
elif [ "$DRY" = 1 ]; then
  say "DRY  would write $DEPLOY_YML, ci.yml and auto-merge.yml (from site-template) and push"
else
  write_deploy_yml
  push_deploy_yml "chore: add self-host deploy shim for $SLUG"
  say "committed and pushed deploy.yml"
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

[ "$DRY" = 1 ] || [ "$SECRET_OK" = 1 ] || { echo "ERROR: deploy secret was not installed" >&2; exit 1; }

# ------------------------------------------------------------------- register
echo "→ register"
if [ "$ALREADY" = 1 ]; then
  say "apps.conf row already present — not appending"
elif [ "$DRY" = 1 ]; then
  LINE="$SLUG|$PORT|$SLUG.$BASE_DOMAIN|$REPO_DIR|.|-|$OWNER|$KIND|$STATUS|$PLAN|$PRICE|$(date -u +%Y-%m-%d)"
  say "DRY  append: $LINE"
else
  LINE="$SLUG|$PORT|$SLUG.$BASE_DOMAIN|$REPO_DIR|.|-|$OWNER|$KIND|$STATUS|$PLAN|$PRICE|$(date -u +%Y-%m-%d)"
  printf '%s\n' "$LINE" >> "$MANIFEST"
  say "appended to $MANIFEST"
  publish_register_row "$LINE"
fi

# ------------------------------------------------------------------------ box
echo "→ box (systemd unit, launch.sh, Caddy vhost, monitoring)"
run "bash '$SYNC_INFRA' '$SLUG'"

# --------------------------------------------------------------------- deploy
if [ "$DEPLOY" = 1 ]; then
  echo "→ deploy"
  run "bash '$DEPLOY_SH' '$SLUG'"
fi

# ----------------------------------------------------------------------- next
if   [ "$DRY" = 1 ];      then SECRET_OK_LABEL="would be set from $DEPLOY_KEY_PATH"
elif [ "$SECRET_OK" = 1 ]; then SECRET_OK_LABEL="set — push deploys"
else                            SECRET_OK_LABEL="NOT set — CD cannot reach the box"; fi
STATUS_LABEL="registered for CD"
REGISTER_NOTE="$SLUG|$PORT|... in scripts/hetzner/apps.conf"
if [ "$ALREADY" = 1 ]; then
  STATUS_LABEL="already registered for CD"
  REGISTER_NOTE="$REGISTER_NOTE (existing)"
fi
cat <<NEXT

✓ $TITLE $STATUS_LABEL

  live      https://$SLUG.$BASE_DOMAIN
  repo      https://github.com/$GH_REPO
  register  $REGISTER_NOTE

  ci        deploy key ${SECRET_OK_LABEL}

NEXT
if [ "$ALREADY" != 1 ]; then
  cat <<NEXT
  Still yours to do:

  1. Commit the register change in the fleetcrown checkout:
       cd $(dirname "$MANIFEST")/../.. && git add scripts/hetzner/apps.conf && git commit

  2. If first deploy failed, fix the app until \`next build\` works, then push main (or workflow_dispatch Deploy).
NEXT
else
  cat <<NEXT
  Still yours to do:

  1. If the hostname 502s, run deploy.sh for this slug (or workflow_dispatch Deploy) once CI is green.
NEXT
fi
