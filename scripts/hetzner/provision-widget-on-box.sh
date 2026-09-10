#!/usr/bin/env bash
#
# Provision a site's FleetCrown project + widget token, ON THE BOX.
#
#   provision-widget-on-box.sh <slug> <title> <host>
#
# Prints the site's env fragment to stdout and nothing else, so a caller can
# append it verbatim:
#
#   NEXT_PUBLIC_FC_WIDGET_TOKEN=<token>
#   NEXT_PUBLIC_FC_PROJECT_ID=<uuid>
#
# WHY THIS EXISTS AT ALL
#
# Production FleetCrown's database is 127.0.0.1/fleetcrown — loopback only.
# Nothing off the box can reach it. `new-site.sh` ran provision-widget.ts on the
# LAPTOP, so the step failed on every run; and because an agent works in a git
# worktree, where the gitignored .env.local does not exist, it failed before it
# even got as far as the network:
#
#   Error: DATABASE_POOL_URL or DATABASE_URL is required
#
# The step is non-fatal by design, so the run continued, built a repo, a box, a
# Caddy vhost and a deploy, and the site went live. Every agent-scaffolded site
# up to 2026-09-11 therefore shipped WITHOUT the feedback widget — the one
# feature that lets an owner change their own site without emailing a person,
# and the reason this studio is not a dev shop. Nothing reported it. It was
# found by reading a live page's HTML and noticing the script tag was absent.
#
# So: run it where the data is. No new credential leaves the box — this reads
# the same env file the running app already uses, over the SSH access the
# scaffold needs anyway for sync-infra and deploy.
#
# TOLERANT OF THE BOX BEING BEHIND. The box checkout is a working tree that
# other jobs use (it carries the durable register), so it is routinely some
# commits behind main. Older provision-widget.ts printed a BARE TOKEN on stdout
# and the project id only in an stderr status line. This normalises both shapes
# into the same fragment, so the caller does not care which version ran.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
source "$HERE/lib.sh"

SLUG="${1:-}"; TITLE="${2:-}"; HOST="${3:-}"
[ -n "$SLUG" ] && [ -n "$TITLE" ] && [ -n "$HOST" ] || {
  echo "usage: provision-widget-on-box.sh <slug> <title> <host>" >&2; exit 2; }

raw_out="$(mktemp)"; raw_err="$(mktemp)"
trap 'rm -f "$raw_out" "$raw_err"' EXIT

# The remote side sources the app's env, names the owner (the script refuses to
# guess between seven users, correctly), and runs the provisioner in place.
ssh -o BatchMode=yes -o ConnectTimeout=20 "$BOX_UBUNTU" \
  "set -a; . '$BOX_FLEETCROWN_ENV'; set +a; \
   export FLEETCROWN_OWNER_EMAIL='$FLEETCROWN_OWNER_EMAIL'; \
   cd '$BOX_FLEETCROWN' && npx tsx scripts/provision-widget.ts '$SLUG' '$TITLE' '$HOST'" \
  >"$raw_out" 2>"$raw_err"
rc=$?

if [ "$rc" -ne 0 ]; then
  echo "provision-widget-on-box: FAILED (exit $rc)" >&2
  grep -vE '^\s*at ' "$raw_err" | tail -5 >&2
  exit "$rc"
fi

# stdout is either `KEY=value` lines (current) or a bare token (older box).
token=""
project=""
# `|| [ -n "$line" ]` is load-bearing, not defensive. The older provisioner ends
# with `process.stdout.write(token.token)` — NO trailing newline — and a bare
# `while read` returns non-zero at an unterminated final line, so the loop body
# never runs for it. Without this the reader silently discards the one value it
# exists to read, and the script reports "no token in output" against a run that
# succeeded. Same family as the other readers that lied here: it failed for a
# reason unrelated to the thing being checked.
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    NEXT_PUBLIC_FC_WIDGET_TOKEN=*) token="${line#*=}" ;;
    NEXT_PUBLIC_FC_PROJECT_ID=*)   project="${line#*=}" ;;
    "") ;;
    *) [ -z "$token" ] && token="$line" ;;
  esac
done < "$raw_out"

# The id appears in an stderr status line either way:
#   + created project "X" (uuid)   /   ↻ project "X" already exists (uuid)
if [ -z "$project" ]; then
  project="$(grep -oE '\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)' "$raw_err" \
             | head -1 | tr -d '()')"
fi

# A token is the point; refuse rather than emit a half fragment that would look
# like success and leave the site with a widget that cannot authenticate.
[ -n "$token" ] || { echo "provision-widget-on-box: no token in output" >&2; exit 1; }

printf 'NEXT_PUBLIC_FC_WIDGET_TOKEN=%s\n' "$token"
[ -n "$project" ] && printf 'NEXT_PUBLIC_FC_PROJECT_ID=%s\n' "$project"

# Status to stderr so stdout stays a clean fragment.
grep -E '^(\+|↻|✓)' "$raw_err" >&2
exit 0
