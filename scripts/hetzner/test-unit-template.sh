#!/usr/bin/env bash
# Tests for the systemd unit sync-infra.sh generates.
#
# THE BUG THIS LOCKS SHUT
#
# `OnFailure=` is a [Unit] directive. It sat in [Service], where systemd does
# not reject it — it logs "Unknown key 'OnFailure' in section [Service],
# ignoring" and carries on. The unit starts, serves, looks healthy, and simply
# never alerts when it dies.
#
# Measured on the box 2026-09-11: 10 of 28 app units had NO effective
# OnFailure. Every one was created AFTER the last install-host-alerts run —
# the drop-in that wires it separately — which is the exact gap the template
# line was added to cover. Its own comment says "alertable from its first
# boot"; it had never once been true for a newly-synced app.
#
# A directive in the wrong section is invisible in every way that matters:
# `systemctl start` works, the journal warning scrolls past on boot, and the
# only witness is `systemctl show -p OnFailure`, which nobody runs.
#
# So: assert placement by SECTION, not merely presence. Extracts the template
# from sync-infra.sh without executing it (it would ssh to the box).
#
# Run: bash scripts/hetzner/test-unit-template.sh

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$HERE/sync-infra.sh"
PASS=0
fail() { echo "  ✗ $1" >&2; exit 1; }
ok()   { PASS=$((PASS + 1)); echo "  ✓ $1"; }

# The template is a heredoc assigned to `unit`. Pull it out literally.
TEMPLATE=$(awk '/^  unit=\$\(cat <<EOF$/{f=1;next} f&&/^EOF$/{exit} f' "$SRC")
[ -n "$TEMPLATE" ] || fail "could not extract the unit template from sync-infra.sh"

# section_of <key> — which [Section] a directive falls under, "" if absent.
section_of() {
  awk -v key="$1" '
    /^\[.*\]$/ { section = $0; next }
    $0 ~ "^" key "=" { print section; exit }
  ' <<< "$TEMPLATE"
}

echo "systemd unit template"

[ -n "$TEMPLATE" ] && ok "the template extracts without running sync-infra (it would ssh to the box)"

is() { [ "$1" = "$2" ] || fail "$3 (want '$2', got '$1')"; }

is "$(section_of OnFailure)" "[Unit]" \
  "OnFailure must be in [Unit] — systemd IGNORES it in [Service] and never alerts"
ok "OnFailure is in [Unit], where systemd reads it"

# The directives that are genuinely [Service] must not drift the other way.
for k in Type User ExecStart Restart RestartSec WorkingDirectory; do
  s=$(section_of "$k")
  [ -z "$s" ] && continue
  is "$s" "[Service]" "$k belongs in [Service]"
done
ok "the process directives stay in [Service]"

is "$(section_of WantedBy)" "[Install]" "WantedBy belongs in [Install]"
ok "WantedBy is in [Install], so the unit can actually be enabled"

# %n already expands to the full unit name including .service, so the instance
# is `notify-failure@<app>-app.service.service`. That looks wrong and is not:
# the template is notify-failure@.service and the instance carries the suffix.
grep -q 'OnFailure=notify-failure@%n\.service' <<< "$TEMPLATE" \
  || fail "OnFailure must instantiate notify-failure@ with %n"
ok "it instantiates notify-failure@%n.service (the handler install-host-alerts installs)"

# A unit whose failure handler is a comment is the shape that started this.
if grep -qE '^\s*#.*OnFailure=' <<< "$TEMPLATE"; then
  fail "OnFailure is commented out — a disabled alert reads exactly like a working one"
fi
ok "OnFailure is live, not commented"

echo "  $PASS passed"
