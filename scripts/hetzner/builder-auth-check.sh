#!/usr/bin/env bash
#
# Is the box builder still allowed to think?
#
# The box-runner drives Claude Code with CLAUDE_CODE_OAUTH_TOKEN from
# /opt/loki/runner/.env. That token is minted by `claude setup-token` on a
# laptop and belongs to the Claude ACCOUNT that minted it. On 2026-09-14 the
# operator had moved to a new account the night before; the box kept the old
# token. Every dispatch from then on read "injected to running claude (pty)",
# printed 113 bytes, and went silent — the 113 bytes were
#   "Your organization has disabled Claude subscription access for Claude Code"
# and nothing anywhere said so. The run was reaped as `timeout` an hour later,
# the next one hung the same way, and the product's whole point (type it in,
# it happens) was quietly off.
#
# So: ask the builder a trivial question with the runner's own environment,
# hourly, and alert on the state FLIP (alert_transition), never per tick. The
# probe is the same command the runner uses, so a green probe is the builder
# working, not a proxy for it.
#
# States:
#   ok        — the model answered
#   disabled  — auth refused: account/org/subscription problem (needs a person)
#   down      — nothing answered (network, CLI missing, timeout)
#
# --report prints the verdict and exits 0 without touching alert state.
# PROBE_OUTPUT (tests) replaces the real probe with a canned answer.
set -uo pipefail   # NOT -e: a probe that dies must still produce a verdict
MON="${MON:-/opt/monitoring}"
RUNNER_ENV="${RUNNER_ENV:-/opt/loki/runner/.env}"
CLAUDE_BIN="${CLAUDE_BIN:-/home/ubuntu/.local/bin/claude}"
PROBE_TIMEOUT="${PROBE_TIMEOUT:-90}"
REPORT_ONLY=0
[ "${1:-}" = "--report" ] && REPORT_ONLY=1
if [ "$REPORT_ONLY" = 0 ]; then
  . "$MON/lib-alert.sh"
fi

probe() {
  if [ -n "${PROBE_OUTPUT+x}" ]; then
    printf '%s' "$PROBE_OUTPUT"
    return "${PROBE_EXIT:-0}"
  fi
  local tok
  tok=$(grep -oE '^CLAUDE_CODE_OAUTH_TOKEN="?[^" ]*' "$RUNNER_ENV" 2>/dev/null | sed -E 's/^CLAUDE_CODE_OAUTH_TOKEN="?//')
  [ -n "$tok" ] || { echo "no CLAUDE_CODE_OAUTH_TOKEN in $RUNNER_ENV"; return 3; }
  [ -x "$CLAUDE_BIN" ] || { echo "claude CLI missing at $CLAUDE_BIN"; return 3; }
  cd /tmp && timeout "$PROBE_TIMEOUT" env HOME=/home/ubuntu CLAUDE_CODE_OAUTH_TOKEN="$tok" \
    "$CLAUDE_BIN" -p "reply with the single word ok" --output-format text 2>&1
}

out=$(probe); code=$?
# Never echo the token; the output is the model's or the CLI's own words.
first=$(printf '%s' "$out" | tr -d '\r' | sed -n '1p' | cut -c1-200)

DISABLED_RE='disabled Claude subscription|subscription access|not authorized|unauthori[sz]ed|invalid.*token|token.*(expired|invalid|revoked)|log ?in|authentication'
if printf '%s' "$out" | grep -qiE "$DISABLED_RE"; then
  state=disabled
elif [ "$code" -eq 0 ] && printf '%s' "$out" | grep -qi 'ok'; then
  state=ok
else
  state=down
fi

case "$state" in
  ok)       msg="builder auth ok — Claude Code answered with the runner's token" ;;
  disabled) msg="builder auth DISABLED — Claude Code refused the runner's token: \"$first\". Mint a new one: laptop \`claude setup-token\` (on the CURRENT Claude account) → /opt/loki/runner/.env CLAUDE_CODE_OAUTH_TOKEN → systemctl restart loki-box-runner. Until then every dispatch hangs and times out." ;;
  down)     msg="builder probe got no answer (exit $code): \"$first\"" ;;
esac

if [ "$REPORT_ONLY" = 1 ]; then
  echo "$state: $msg"
  exit 0
fi
case "$state" in
  ok)       alert_transition builder_auth ok "✅" "$msg" ;;
  disabled) alert_transition builder_auth bad "🔑" "$msg" "builder auth (Claude Code token on the box)" ;;
  down)     alert_transition builder_auth bad "🔌" "$msg" "builder probe" ;;
esac
exit 0
