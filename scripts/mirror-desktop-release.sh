#!/usr/bin/env bash
# Mirror a Fleet Runner build from the desktop-release GH Actions workflow
# to the canonical public release host maonakamoto/fleetcrown-releases,
# with the correct fleet-runner-v* tag.
#
# Why this exists: electron-builder's GH provider can only publish to the
# workflow's own repo using the default GITHUB_TOKEN (cross-repo writes need
# a PAT), and it derives its tag from package.json as `v<version>`. Marketing
# URLs point at maonakamoto/fleetcrown-releases tagged `fleet-runner-v<version>`.
# So the build job publishes nothing at all, and this script assembles the
# release from the build artifacts under the tag we actually want.
#
# Source: workflow artifacts on the latest successful desktop-release run.
# (Earlier versions of this script read from the draft release, but that
# proved unreliable — concurrent matrix jobs racing on the same draft can
# leave assets missing. Workflow artifacts always contain everything that
# was built, per-OS.)
#
# The `mirror` job in .github/workflows/desktop-release.yml calls this
# automatically on every `fleet-runner-v*` tag push, using the
# RELEASES_REPO_TOKEN secret. Running it by hand is now only a rescue path
# (e.g. re-publishing after fixing a release), not a required release step.
#
# Usage:
#   scripts/mirror-desktop-release.sh <version> [<workflow-run-id>]
# Example:
#   scripts/mirror-desktop-release.sh 0.3.0
#   scripts/mirror-desktop-release.sh 0.3.0 26886696818   # explicit run
#
# Requirements:
#   - gh CLI logged in with write access to fleetcrown-releases (admin/maintain).
#   - A successful desktop-release workflow run for fleet-runner-v<version>.
#
# Idempotent: if the destination release already exists, missing assets are
# uploaded with --clobber. Nothing is deleted or renamed.

set -euo pipefail

VERSION="${1:-}"
RUN_ID="${2:-}"
if [[ -z "$VERSION" ]]; then
  echo "usage: $0 <version> [<workflow-run-id>]  (e.g. 0.3.0)" >&2
  exit 64
fi

# A release that ships but is never recorded makes the product lie about itself.
# FLEET_RUNNER_RELEASES in src/config/changelog.ts is the SSOT for /releases AND
# the sidebar/footer version pill, and it is hand-maintained with nothing
# enforcing it. 0.8.11 shipped 2026-08-04 and was never added, so for ten days
# the app told every operator it was running v0.8.9 — the same class of stale
# version claim as the box-runner pin fixed in #267, which is why this is a
# check and not a reminder.
#
# Ordering this imposes: land the changelog entry on main FIRST, then push the
# tag. That is the correct order anyway — the entry describes what you are about
# to ship, and writing it is when you notice you cannot say what changed.
RELEASES_TS="$(dirname "$0")/../src/config/changelog.ts"
if [[ -f "$RELEASES_TS" ]]; then
  if ! grep -q "version: \"${VERSION}\"" "$RELEASES_TS"; then
    echo "error: no FLEET_RUNNER_RELEASES entry for ${VERSION} in src/config/changelog.ts" >&2
    echo "       Publishing would leave /releases and the footer version pill" >&2
    echo "       claiming an older version than operators are actually running." >&2
    echo "       Add the entry (version/tag/date/highlights), merge it, re-run." >&2
    exit 1
  fi
  echo "==> release ${VERSION} is recorded in src/config/changelog.ts"
else
  # Rescue path: script run from outside a checkout. Say so rather than
  # silently skipping the guard.
  echo "warning: ${RELEASES_TS} not found — skipping the recorded-release check" >&2
fi

SRC_REPO="maonakamoto/fleetcrown"
SRC_TAG="fleet-runner-v${VERSION}"   # git tag the workflow ran against
DST_REPO="maonakamoto/fleetcrown-releases"
DST_TAG="fleet-runner-v${VERSION}"

# Resolve the workflow run that built this tag if the caller didn't pass one.
# We want the latest successful run on the fleet-runner-v<version> ref.
if [[ -z "$RUN_ID" ]]; then
  echo "==> locating successful desktop-release run for $SRC_TAG"
  RUN_ID=$(gh run list \
    --workflow=desktop-release.yml \
    --repo "$SRC_REPO" \
    --branch "$SRC_TAG" \
    --status success \
    --limit 1 \
    --json databaseId \
    --jq '.[0].databaseId')
  if [[ -z "$RUN_ID" || "$RUN_ID" == "null" ]]; then
    echo "error: no successful desktop-release run found for $SRC_TAG" >&2
    echo "       check: gh run list --workflow=desktop-release.yml --repo $SRC_REPO --branch $SRC_TAG" >&2
    exit 1
  fi
  echo "    found run $RUN_ID"
fi

STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT

echo "==> downloading workflow artifacts from run $RUN_ID"
gh run download "$RUN_ID" --repo "$SRC_REPO" -D "$STAGE_DIR"

# Workflow puts each OS's output in a subdirectory; flatten for upload.
# Layout we expect:
#   $STAGE_DIR/fleet-runner-ubuntu-latest/{...AppImage, ...deb, latest-linux.yml}
#   $STAGE_DIR/fleet-runner-macos-latest/{...dmg, ...zip, latest-mac.yml}
#   $STAGE_DIR/fleet-runner-windows-latest/{...exe, latest.yml}
FLAT_DIR="$STAGE_DIR/_flat"
mkdir -p "$FLAT_DIR"
find "$STAGE_DIR" -type f \
  \( -name 'Fleet-Runner-*' -o -name 'latest*.yml' \) \
  -exec cp -n {} "$FLAT_DIR/" \;

ASSET_COUNT=$(find "$FLAT_DIR" -maxdepth 1 -type f | wc -l)
if [[ "$ASSET_COUNT" -lt 5 ]]; then
  echo "error: expected at least 5 assets after flattening, got $ASSET_COUNT" >&2
  echo "       listing:" >&2
  ls -la "$FLAT_DIR" >&2 || true
  exit 1
fi
echo "    flattened $ASSET_COUNT assets:"
ls "$FLAT_DIR" | sed 's/^/      /'

NOTES=$(cat <<EOF
## Fleet Runner v${VERSION}

Auto-mirrored from $SRC_REPO build pipeline (workflow run $RUN_ID).

### Downloads
- **Linux**: \`Fleet-Runner-linux-x86_64.AppImage\` or \`Fleet-Runner-linux-amd64.deb\`
- **macOS (Apple Silicon)**: \`Fleet-Runner-mac-arm64.dmg\`
- **Windows (x64)**: \`Fleet-Runner-win-x64.exe\`

Marketing URLs use \`/releases/latest/download/...\` and resolve to this release automatically. From Fleet Runner v0.3.0 onward, the desktop app checks this release on launch and auto-applies updates.
EOF
)

if gh release view "$DST_TAG" --repo "$DST_REPO" >/dev/null 2>&1; then
  echo "==> $DST_TAG already exists on $DST_REPO — uploading missing/changed assets"
  gh release upload "$DST_TAG" --repo "$DST_REPO" --clobber "$FLAT_DIR"/*
else
  echo "==> creating $DST_TAG on $DST_REPO and uploading $ASSET_COUNT assets"
  gh release create "$DST_TAG" --repo "$DST_REPO" \
    --title "Fleet Runner v${VERSION}" \
    --notes "$NOTES" \
    "$FLAT_DIR"/*
fi

echo
echo "==> mirror complete: https://github.com/${DST_REPO}/releases/tag/${DST_TAG}"
echo "    Marketing /releases/latest/download/... URLs now serve v${VERSION}."
