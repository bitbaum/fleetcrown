#!/usr/bin/env bash
# Mirror a Fleet Runner build from the workflow's draft release on
# maonakamoto/fleetcrown to the canonical public release host
# maonakamoto/fleetcrown-releases, with the correct fleet-runner-v* tag.
#
# Why this exists: electron-builder's GH provider can only publish to the
# workflow's own repo using the default GITHUB_TOKEN (cross-repo writes need
# a PAT). The build therefore lands as a DRAFT on maonakamoto/fleetcrown
# tagged `v<version>`, while marketing URLs point at maonakamoto/fleetcrown-
# releases tagged `fleet-runner-v<version>`. This script reconciles that.
#
# Until a cross-repo PAT secret is wired into the workflow, this is the
# documented post-build step for every release. Run it once after the
# Desktop release workflow turns green.
#
# Usage:
#   scripts/mirror-desktop-release.sh <version>
# Example:
#   scripts/mirror-desktop-release.sh 0.2.0
#
# Requirements:
#   - gh CLI logged in with write access to BOTH repos (admin/maintain).
#   - The draft release on maonakamoto/fleetcrown must already contain the
#     v<version> assets (the desktop-release workflow puts them there).
#
# Idempotent: if the destination release already exists, this script will
# upload missing assets with --clobber and stop — it won't delete or rename
# anything.

set -euo pipefail

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "usage: $0 <version>  (e.g. 0.2.0)" >&2
  exit 64
fi

SRC_REPO="maonakamoto/fleetcrown"
SRC_TAG="v${VERSION}"               # electron-builder uses v<pkg.version>
DST_REPO="maonakamoto/fleetcrown-releases"
DST_TAG="fleet-runner-v${VERSION}"  # matches the git tag that triggered the build

STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT

echo "==> downloading $SRC_TAG assets from $SRC_REPO"
cd "$STAGE_DIR"
gh release download "$SRC_TAG" --repo "$SRC_REPO"

NOTES=$(cat <<EOF
## Fleet Runner v${VERSION}

Auto-mirrored from $SRC_REPO build pipeline.

### Downloads
- **Linux**: \`Fleet-Runner-linux-x86_64.AppImage\` or \`Fleet-Runner-linux-amd64.deb\`
- **macOS (Apple Silicon)**: \`Fleet-Runner-mac-arm64.dmg\`
- **Windows (x64)**: \`Fleet-Runner-win-x64.exe\`

Marketing URLs use \`/releases/latest/download/...\` and will resolve to this release automatically.
EOF
)

if gh release view "$DST_TAG" --repo "$DST_REPO" >/dev/null 2>&1; then
  echo "==> $DST_TAG already exists on $DST_REPO — uploading any missing assets"
  gh release upload "$DST_TAG" --repo "$DST_REPO" --clobber ./*
else
  echo "==> creating $DST_TAG on $DST_REPO and uploading assets"
  # shellcheck disable=SC2046
  gh release create "$DST_TAG" --repo "$DST_REPO" \
    --title "Fleet Runner v${VERSION}" \
    --notes "$NOTES" \
    $(ls)
fi

echo
echo "==> mirror complete: https://github.com/${DST_REPO}/releases/tag/${DST_TAG}"
echo "    Marketing /releases/latest/download/... URLs now serve v${VERSION}."
echo
echo "Optional cleanup — delete the draft on ${SRC_REPO}:"
echo "  gh release delete ${SRC_TAG} --repo ${SRC_REPO} --yes"
