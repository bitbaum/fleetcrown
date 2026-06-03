#!/usr/bin/env bash
# Mirror a Fleet Runner build from the desktop-release GH Actions workflow
# to the canonical public release host maonakamoto/fleetcrown-releases,
# with the correct fleet-runner-v* tag.
#
# Why this exists: electron-builder's GH provider can only publish to the
# workflow's own repo using the default GITHUB_TOKEN (cross-repo writes need
# a PAT). Marketing URLs point at maonakamoto/fleetcrown-releases tagged
# `fleet-runner-v<version>`; the build publishes a draft on
# maonakamoto/fleetcrown tagged `v<version>`. This script reconciles them.
#
# Source: workflow artifacts on the latest successful desktop-release run.
# (Earlier versions of this script read from the draft release, but that
# proved unreliable — concurrent matrix jobs racing on the same draft can
# leave assets missing. Workflow artifacts always contain everything that
# was built, per-OS.)
#
# Until a cross-repo PAT secret is wired into the workflow, this is the
# documented post-build step for every release. Run it once after the
# Desktop release workflow turns green.
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
echo
echo "Optional cleanup — delete the (likely incomplete) draft on ${SRC_REPO}:"
echo "  gh release delete v${VERSION} --repo ${SRC_REPO} --yes"
