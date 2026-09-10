#!/usr/bin/env bash
# Tests for next_free_port (scripts/hetzner/lib.sh).
#
# THE BUG THIS LOCKS SHUT
#
# new-site.sh allocated `max(port in apps.conf) + 1` and nothing else. The
# register is not the only thing listening on that box and never claimed to be:
# the handcrafted services on 4001-4004 are excluded by design, and annushka's
# enquiry API holds 4030 behind a hand-written vhost specifically so sync-infra
# will not regenerate it. On 2026-09-10 the highest registered port was 4025 and
# three rows had been added that day, so allocation was four sites from handing
# out 4030.
#
# A port collision does not fail at allocation. It fails later, when the new
# unit starts, binds nothing, and the OTHER app is the one that looks broken —
# which is why this is worth a gate rather than a comment.
#
# next_free_port is pure (the caller passes what is taken), so every case here
# runs without the box and without the network.
#
# Run: bash scripts/hetzner/test-port-alloc.sh

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/lib.sh"

PASSED=0
fail() { echo "  ✗ $1" >&2; exit 1; }
ok()   { PASSED=$((PASSED + 1)); echo "  ✓ $1"; }
is()   { [ "$1" = "$2" ] || fail "$3 (got '$1', want '$2')"; }

echo "port allocation"

is "$(next_free_port 4026 "$(printf '4001\n4030\n')")" 4026 \
  "a free candidate is returned unchanged"
ok "a candidate nothing holds is returned unchanged"

# The exact shape that was four sites away.
is "$(next_free_port 4030 "$(printf '4001\n4002\n4030\n')")" 4031 \
  "must step over an occupied port"
ok "a candidate that is live but unregistered is stepped over (annushka's 4030)"

is "$(next_free_port 4030 "$(printf '4030\n4031\n4032\n')")" 4033 \
  "must keep stepping across a run"
ok "a run of occupied ports is walked to the first gap"

is "$(next_free_port 4026 "")" 4026 \
  "empty taken-list must not hang or mangle the port"
ok "an empty taken-list returns the candidate (caller announces it as unverified)"

# A substring must not count as a hit: 403 is not 4030, and grep without -x
# would have said it was — silently shifting every future allocation by one.
is "$(next_free_port 403 "$(printf '4030\n')")" 403 \
  "403 must not match 4030"
ok "matching is exact — 403 is not a hit for 4030"

is "$(next_free_port 4030 "$(printf ' 4030 \n')")" 4030 \
  "a padded entry is not an exact match"
ok "whitespace-padded entries do not match (sweep output is trimmed upstream)"

echo "  $PASSED passed"
