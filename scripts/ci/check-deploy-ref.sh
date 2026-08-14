#!/usr/bin/env bash
# check-deploy-ref.sh — the off-main gate for hand-run deploys.
#
# INVARIANT: production may only ever run a commit contained in origin/main.
#
# deploy-hetzner.sh already guards against HEAD moving DURING a build (--ref).
# That does nothing about the bigger hazard: deploying a commit that was never
# on main at all. A worktree sitting on a feature branch carries unreviewed
# commits AND is missing everything merged since it branched, so shipping it
# does two bad things at once — publishes unreviewed code and silently ROLLS
# BACK main.
#
# Not hypothetical; it has happened twice. The second time (2026-08-14) two
# local deploys ran minutes apart from a stale branch, rotating the correct CI
# build out through app.prev and reverting three merged PRs. Prod then served a
# Loki with no approval-queue tool while main had shipped it hours earlier — and
# the symptom was indistinguishable from an application bug, so it was chased
# through the app for an hour. Ancestry is the invariant, so it is checked, not
# remembered.
#
# Usage:   bash scripts/ci/check-deploy-ref.sh <repo-dir> [ref]
# Exit:    0 = safe to deploy (or gate legitimately skipped), 1 = refuse.
# Override: FLEETCROWN_DEPLOY_ALLOW_OFF_MAIN=1 (deliberate, must be typed).

set -euo pipefail

REPO="${1:?usage: check-deploy-ref.sh <repo-dir> [ref]}"
REF="${2:-HEAD}"

if [ -n "${FLEETCROWN_DEPLOY_ALLOW_OFF_MAIN:-}" ]; then
  echo "  ⚠ off-main gate OVERRIDDEN by FLEETCROWN_DEPLOY_ALLOW_OFF_MAIN"
  exit 0
fi

SHIP_SHA="$(git -C "$REPO" rev-parse --verify --quiet "${REF}^{commit}" || echo "")"
if [ -z "$SHIP_SHA" ]; then
  echo "✗ deploy REFUSED — '${REF}' does not resolve to a commit in ${REPO}." >&2
  exit 1
fi

# Refresh origin/main so a locally-stale ref cannot produce a false refusal.
# Never fatal: an offline laptop should still be gated on what it knows.
git -C "$REPO" fetch --quiet origin main 2>/dev/null || true

MAIN_REF="$(git -C "$REPO" rev-parse --verify --quiet origin/main || echo "")"
if [ -z "$MAIN_REF" ]; then
  # Shallow/hosted CI checkouts have no origin/main ref. Warn rather than block:
  # the hosted deploy path builds main by construction, and hard-failing here
  # would break the very pipeline this gate exists to protect.
  echo "  ⚠ off-main gate skipped — origin/main not resolvable in this checkout"
  exit 0
fi

if git -C "$REPO" merge-base --is-ancestor "$SHIP_SHA" "$MAIN_REF"; then
  exit 0
fi

BRANCH="$(git -C "$REPO" rev-parse --abbrev-ref HEAD 2>/dev/null || echo detached)"
AHEAD="$(git -C "$REPO" rev-list --count "${MAIN_REF}..${SHIP_SHA}" 2>/dev/null || echo '?')"
BEHIND="$(git -C "$REPO" rev-list --count "${SHIP_SHA}..${MAIN_REF}" 2>/dev/null || echo '?')"

echo "✗ deploy REFUSED — ${SHIP_SHA:0:12} (${BRANCH}) is not contained in origin/main." >&2
echo "  ${AHEAD} commit(s) here are unreviewed; ${BEHIND} commit(s) on main would be ROLLED BACK." >&2
echo "  Ship through the pipeline instead: open a PR, let it merge, Deploy runs on main." >&2
echo "  To override deliberately: FLEETCROWN_DEPLOY_ALLOW_OFF_MAIN=1 bash scripts/deploy-hetzner.sh" >&2
exit 1
