#!/usr/bin/env bash
# doctor.sh — is my local dev environment healthy? Fast self-serve triage so
# "why is X broken" is answerable in one command instead of a scavenger hunt.
# Prints ✓ / ⚠ / ✗ per check; exits non-zero if any HARD requirement fails
# (warnings don't fail — they're "fine if you're offline / not deploying").
set -uo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAIL=0
ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; }
warn() { printf "  \033[33m⚠\033[0m %s\n" "$1"; }
bad()  { printf "  \033[31m✗\033[0m %s\n" "$1"; FAIL=1; }

echo "── FleetCrown doctor ─────────────────────────────────────"

# Node (CI pins 22)
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if [ "${NODE_MAJOR:-0}" -ge 22 ]; then ok "node $(node --version) (>=22)"
else bad "node $(node --version 2>/dev/null || echo '?') — need >=22 (CI uses 22)"; fi

# Dependencies installed
[ -d node_modules ] && ok "node_modules present" || bad "node_modules missing — run 'pnpm install'"

# .env.local + DATABASE_URL
DBURL=""
if [ -f .env.local ]; then
  ok ".env.local present"
  DBURL=$(grep -oE '^DATABASE_URL=.*' .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"')
  [ -n "$DBURL" ] && ok "DATABASE_URL set" || bad "DATABASE_URL missing from .env.local (see .env.example)"
else
  bad ".env.local missing — copy .env.example and fill it"
fi

# Local Postgres actually reachable
if [ -n "$DBURL" ] && command -v psql >/dev/null 2>&1; then
  if psql "$DBURL" -c 'select 1' >/dev/null 2>&1; then ok "Postgres reachable"
  else bad "Postgres NOT reachable at DATABASE_URL — is it running?"; fi
else
  warn "Postgres check skipped (no DATABASE_URL or psql not installed)"
fi

# gh (needed by the CI-gated deploy)
if command -v gh >/dev/null 2>&1; then
  gh auth status >/dev/null 2>&1 && ok "gh authenticated" \
    || warn "gh not authenticated — 'gh auth login' (needed for the CI-gated deploy)"
else
  warn "gh not installed — the push-deploy CI gate passes open without it"
fi

# Box reachable (fine to be offline)
if . scripts/hetzner/_box-env.sh 2>/dev/null && [ -n "${BOX_ROOT:-}" ]; then
  if timeout 8 ssh -o ConnectTimeout=5 -o BatchMode=yes "$BOX_ROOT" true >/dev/null 2>&1; then
    ok "box reachable ($BOX_ROOT)"
  else
    warn "box not reachable from here ($BOX_ROOT) — fine if you're offline"
  fi
fi

# Branch hygiene
[ "$(git config --get remote.origin.prune 2>/dev/null)" = "true" ] \
  && ok "git auto-prune enabled" \
  || warn "git auto-prune off — 'git config remote.origin.prune true' (or 'pnpm run git:prune')"

echo "──────────────────────────────────────────────────────────"
if [ "$FAIL" -eq 0 ]; then echo "  doctor: OK"; else echo "  doctor: $FAIL hard issue(s) above — fix before dev/deploy"; fi
exit "$FAIL"
