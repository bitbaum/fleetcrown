#!/usr/bin/env bash
#
# Typecheck and build the Fleet Runner desktop app.
#
# WHY THIS EXISTS
# ---------------
# `npm run verify` covered src/, home/ and widget/ — everything except desktop/.
# The root tsconfig does not include it, `workspaces` is packages/* only, and
# eslint is pointed at src/ home/. So for the desktop app's entire life the only
# thing that ever compiled it was `desktop-release.yml`, which runs on a version
# TAG. Every desktop breakage was therefore discovered at release time, on three
# OS runners at once, after the version number had already been minted — which is
# how v0.8.6-v0.8.9 shipped Linux-only or not at all.
#
# Auto-merge turned that from expensive into unsafe: a PR touching only desktop/
# has nothing that can fail, so it goes green and merges itself. The three open
# Dependabot PRs bumping desktop's vite (6->8, a major), @types/node (20->26) and
# @electron-toolkit/tsconfig were all in exactly that position.
#
# IT RUNS ON EVERY PR, NOT JUST desktop/** CHANGES
# ------------------------------------------------
# A path filter here would be wrong, not merely conservative. desktop/src/main
# imports ../src and ../home through the @/* and @home/* aliases, and the built
# main bundle really does contain src/lib/agents/*, src/lib/agent-registry.ts and
# friends. A change confined to src/ can break the desktop build; only building
# it proves otherwise.
#
# COST
# ----
# ~70s cold, and no Electron binary is downloaded: the install runs with
# --ignore-scripts, which skips electron's ~100MB postinstall and
# electron-builder's install-app-deps. Neither is needed to typecheck or to let
# vite compile the main and preload bundles. Packaging still happens only in the
# release workflow, on the real OS runners.

set -euo pipefail

cd "$(dirname "$0")/../desktop"

# The lockfile is the SSOT for what to install; --ignore-scripts is what keeps
# this cheap. `npm ci` always wipes node_modules, so only pay for it when the
# deps are actually absent (CI: always; a repeat local run: never).
if [ ! -d node_modules ]; then
  echo "[check:desktop] installing desktop deps (no electron binary)"
  npm ci --ignore-scripts --no-audit --no-fund
fi

echo "[check:desktop] typecheck"
npx tsc --noEmit -p tsconfig.json

# `npx electron-vite build`, not `npm run build` — the latter fires the prebuild
# hook, which regenerates icons and downloads a platform-specific Zellij binary.
# Neither affects whether the code compiles, and both need the network.
echo "[check:desktop] build (main + preload)"
npx electron-vite build

echo "[check:desktop] ok"
