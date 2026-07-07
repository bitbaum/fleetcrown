#!/usr/bin/env bash
#
# OPTIONAL, SEPARATE from the deploy gate (DevOps remediation #2, extra layer).
#
# The deploy.yml workflow_run already guarantees "red CI can't ship" WITHOUT
# this. This goes further: it stops a red commit from even landing on `main` by
# requiring the CI `check` job to pass before merge.
#
# ⚠️  BEHAVIOR CHANGE: with required status checks, GitHub REJECTS direct pushes
#     to main (the checks can't have passed at push time). You must then land
#     changes via PR. If you rely on `git push origin main`, do NOT run this —
#     the deploy.yml gate alone is enough. Run this only if you want PR-based main.
#
# Requires: gh authenticated with admin on the repo.
# Usage:  bash scripts/setup-branch-protection.sh          # enable
#         bash scripts/setup-branch-protection.sh --remove # disable
set -euo pipefail

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
echo "repo: $REPO"

if [ "${1:-}" = "--remove" ]; then
  gh api -X DELETE "repos/$REPO/branches/main/protection"
  echo "✓ branch protection removed from main"
  exit 0
fi

# Require the CI job named "check" (see ci.yml). strict=true → branch must be up
# to date with main before merge. No required reviews (solo repo); flip
# required_pull_request_reviews if you want them.
gh api -X PUT "repos/$REPO/branches/main/protection" \
  --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["check"] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null
}
JSON

echo "✓ main now requires the CI 'check' job to pass before merge."
echo "  Direct pushes to main will be rejected — use PRs from here on."
echo "  Undo: $0 --remove"
