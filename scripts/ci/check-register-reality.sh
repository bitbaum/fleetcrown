#!/usr/bin/env bash
#
# Does the register still describe the box, and the box still match the register?
#
# WHY
#
# check-deploy-ready.sh judges the register's SHAPE — field count, unique names,
# unique ports — and it judges it well. But every drift found on 2026-09-10 was
# shape-valid and still wrong, because nothing compared the file to the world:
#
#   aoz-wohnen's `domains` named aoz-wohnen.orangecat.ch, which only 308s to the
#   host that actually serves. sync-infra.sh rewrites each vhost from that field
#   with an unconditional `tee`, so the next sync would have deleted the
#   aoz.orangecat.ch site block and taken a live client's URL off the air.
#
#   revamp-info listed hirnli.orangecat.ch, which has its own hand-written
#   vhost. A sync would have emitted the host twice; two site blocks for one
#   address fails `caddy validate`, which runs immediately before
#   `systemctl reload` — so the reload aborts and EVERY other app's pending
#   vhost change silently fails with it.
#
#   annushka's enquiry API holds 4030 with no row, while new-site.sh allocated
#   `max(registered)+1`. That was four sites from a collision on 2026-09-10 and
#   two by the end of the same day.
#
# None of those fail loudly. A redirect answers 200; an unregistered port is
# invisible until something else binds it; a duplicate host does not break until
# the next reload. So this asks the three questions the shape check cannot:
#
#   1. does every registered domain SERVE ITSELF, or is it a redirect?
#   2. is any vhost on the box unbacked by a register row?
#   3. is anything listening in the app band that the register does not know?
#
# Exceptions are decisions, not silences: register-reality.allow lists each one
# WITH a reason. Registering those would be actively wrong — sync-infra would
# replace their hand-written vhosts with plain proxies.
#
# Needs the network and the box, so it is NOT part of `verify`. It is driven by
# scripts/local/fleet-register-check, which already runs daily and pages with a
# per-finding cooldown. Where it cannot reach the box it says SKIPPED, loudly —
# a vacuous pass reads exactly like coverage.
#
#   check-register-reality.sh [--no-box] [--manifest FILE]
set -uo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ALLOW_FILE="${ALLOW_FILE:-$SELF_DIR/register-reality.allow}"
NO_BOX=""
[ "${1:-}" = "--no-box" ] && { NO_BOX=1; shift; }
[ "${1:-}" = "--manifest" ] && { export MANIFEST="${2:-}"; shift 2; }

. "$SELF_DIR/../hetzner/lib.sh"

# lib.sh sets `set -euo pipefail`, and -e is wrong for a REPORTER: this script's
# whole job is to run probes that are expected to fail and then say so. Without
# this, the first curl that times out kills the run — observed exit 28 (curl's
# timeout) with not one line of output, which reads as "nothing to report".
# -u and pipefail stay on; only the exit-on-error goes.
set +e

# A here-string, not a pipeline. `x | grep -q` under `set -o pipefail` reports
# FAILURE on a successful match once the payload passes the pipe buffer: grep -q
# exits at the first hit, the writer takes SIGPIPE, and pipefail surfaces the
# writer's death as the pipeline's status. Measured 2026-09-11: 20/20 false
# failures on a large payload, 0/20 on a small one — which is why it presents as
# a gate that flakes rather than a gate that is wrong. Here-strings are not
# pipelines and have nothing to signal.
allowed() {  # allowed <kind> <name>
  grep -q "^$1|$2|" <<< "$(grep -v '^#' "$ALLOW_FILE" 2>/dev/null)"
}

failed=0

# ---------------------------------------------------- 1. domains that redirect
# Only the first domain is the canonical one sync-infra puts first; the rest are
# aliases served by the same block and are expected to answer alike.
redirects=""
checked=0
while IFS='|' read -r name port domains repo appdir db owner kind status plan price since; do
  case "$name" in \#*|"") continue ;; esac
  [ "$domains" = "-" ] && continue
  first="${domains%%,*}"
  checked=$((checked + 1))
  eff=$(curl -s -o /dev/null -w '%{url_effective}' --max-time 15 -L "https://$first/" 2>/dev/null)
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -L "https://$first/" 2>/dev/null)
  host=$(printf '%s' "$eff" | sed -E 's#https?://([^/]+).*#\1#')
  if [ -z "$host" ] || [ "$code" = 000 ]; then
    # A prospect or demo that is not serving yet is not a register defect.
    case "$status" in live) redirects="$redirects $name:UNREACHABLE" ;; esac
  elif [ "$host" != "$first" ]; then
    redirects="$redirects $name:$first->$host"
  fi
done < <(grep -v '^#' "$MANIFEST")

if [ -n "$redirects" ]; then
  failed=1
  echo "✗ the register names a host that is not the one serving:"
  for r in $redirects; do echo "    ${r%%:*} — ${r#*:}"; done
  echo "  Not cosmetic: sync-infra.sh rewrites each vhost from this field, so the"
  echo "  next sync makes the register's version true and deletes the other."
else
  echo "✓ domains: all $checked registered hosts serve themselves, none via a redirect"
fi

# --------------------------------------------- 2 & 3. what the box has extra
if [ -n "$NO_BOX" ]; then
  echo "· box inspection SKIPPED (--no-box): vhosts and ports NOT checked"
  [ "$failed" = 0 ]
  exit $?
fi

BOX_OUT=$(box "ls /etc/caddy/apps.d/*.caddy 2>/dev/null | xargs -n1 basename 2>/dev/null; echo '---PORTS---'; ss -ltnH 2>/dev/null | awk '{print \$4}'" 2>/dev/null)
if [ -z "$BOX_OUT" ]; then
  echo "· box inspection NOT RUN: could not read $BOX."
  echo "  Announced rather than passed — 'nothing extra' and 'could not look' are"
  echo "  different answers and only one of them is safe."
  [ "$failed" = 0 ]
  exit $?
fi

reg_names=$(grep -v '^#' "$MANIFEST" | cut -d'|' -f1)
reg_ports=$(grep -v '^#' "$MANIFEST" | cut -d'|' -f2 | grep -E '^[0-9]+$')

extra_vhosts=""
while IFS= read -r f; do
  [ -z "$f" ] && continue
  n="${f%.caddy}"
  grep -qx "$n" <<< "$reg_names" && continue
  allowed vhost "$n" && continue
  extra_vhosts="$extra_vhosts $n"
done < <(printf '%s\n' "$BOX_OUT" | sed -n '1,/---PORTS---/p' | grep '\.caddy$')

extra_ports=""
while IFS= read -r p; do
  p="${p##*:}"
  case "$p" in ''|*[!0-9]*) continue ;; esac
  [ "$p" -ge 4000 ] && [ "$p" -le 4099 ] || continue
  grep -qx "$p" <<< "$reg_ports" && continue
  allowed port "$p" && continue
  case " $extra_ports " in *" $p "*) continue ;; esac
  extra_ports="$extra_ports $p"
done < <(printf '%s\n' "$BOX_OUT" | sed -n '/---PORTS---/,$p')

if [ -n "$extra_vhosts" ]; then
  failed=1
  echo "✗ vhost(s) on the box with no register row and no recorded exception:$extra_vhosts"
  echo "  Either add a row, or add a line to $(basename "$ALLOW_FILE") saying why not."
else
  echo "✓ vhosts: every Caddy site is either registered or a recorded exception"
fi

if [ -n "$extra_ports" ]; then
  failed=1
  echo "✗ port(s) listening in the app band that the register does not know:$extra_ports"
  echo "  new-site.sh now asks the box before allocating, so this is no longer a"
  echo "  collision — but an unrecorded service is still a thing nobody can find."
else
  echo "✓ ports: every listener in 4000-4099 is registered or a recorded exception"
fi

[ "$failed" = 0 ]
