#!/usr/bin/env bash
# record-build-ref.sh — stamp the built artifact with the commit it was built from.
#
# WHY: until this existed, production could not say what it was running. The box
# keeps no deploy marker and /api/health reported `npm_package_version`, which is
# null under systemd. The only way to answer "is prod on main?" was to ssh in and
# grep the compiled bundle for a symbol you knew was in the new source.
#
# That gap is not cosmetic. A hand-run deploy ships whatever branch the worktree
# is on, and it has now rolled prod back three times (2026-08-14 being the third,
# with the off-main gate already in place — an ancestor of main passes it). Each
# time the symptom presented as an application bug, because nothing anywhere
# claimed a commit. See docs + `scripts/ci/check-deploy-ref.sh`.
#
# ONE writer, deliberately: this runs at BUILD time and writes into the build
# output, so the marker rides both deploy paths (local deploy-hetzner.sh and the
# GitHub Deploy workflow, which builds the same way then ships with --no-build).
# Writing it at deploy time instead would mean two writers of one fact.
#
# Best-effort by construction: an unknown commit must not fail a build. A missing
# marker degrades to `commit: null`, exactly the behaviour we had before.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/.next/standalone/.build-ref"

# Precedence: the pinned ref a deploy asked for, then the CHECKED-OUT commit,
# and only then CI's env.
#
# FLEETCROWN_DEPLOY_REF first because deploy-hetzner.sh pins it and HEAD can
# drift mid-build. Git HEAD before GITHUB_SHA because HEAD is literally what was
# compiled: on the `workflow_run` path deploy.yml checks out
# `workflow_run.head_sha`, which is NOT always the `GITHUB_SHA` of the run.
# Trusting the env there would stamp a commit that was never built — a marker
# that lies is worse than no marker, since the deploy compares against it.
# GITHUB_SHA stays as the last resort for checkouts with no .git.
SHA="${FLEETCROWN_DEPLOY_REF:-}"
[ -z "$SHA" ] && SHA="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo "")"
[ -z "$SHA" ] && SHA="${GITHUB_SHA:-}"

if [ -z "$SHA" ]; then
  echo "  ⚠ build-ref not recorded — no FLEETCROWN_DEPLOY_REF, GITHUB_SHA, or git HEAD"
  exit 0
fi

if [ ! -d "$ROOT/.next/standalone" ]; then
  # Not a standalone build (e.g. a dev/analyze build). Nothing to stamp.
  exit 0
fi

printf '%s\n' "$SHA" > "$OUT" 2>/dev/null \
  || { echo "  ⚠ build-ref not written to $OUT"; exit 0; }

echo "  ✓ build-ref ${SHA:0:12} recorded"
