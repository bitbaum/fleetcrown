#!/usr/bin/env bash
# import-from-local.sh — scan local dev folders and import each as a FleetCrown project.
#
# Run from your laptop's terminal:
#   curl -sS https://fleetcrown.orangecat.ch/import-from-local.sh \
#     | FC_TOKEN=ck_xxxxxxxxxxxx... bash
#
# Or save + run locally:
#   chmod +x import-from-local.sh
#   FC_TOKEN=ck_... ./import-from-local.sh
#
# Required:
#   FC_TOKEN — your ck_* agent token. Mint one at
#              https://fleetcrown.orangecat.ch/settings (Agent tokens section).
#
# Optional:
#   FC_API   — override the API base URL (default: https://fleetcrown.orangecat.ch)
#   FC_ROOTS — colon-separated dev folders to scan
#              (default: $HOME/dev:$HOME/code:$HOME/Code:$HOME/Projects)
#   FC_DEPTH — max subdirectory depth to scan for .git folders (default: 3)
#
# What it does:
#   1. Walks each FC_ROOTS path looking for `.git` directories (max FC_DEPTH deep)
#   2. For each git repo found, extracts: dir name, abs path, origin URL, last-commit ISO
#   3. POSTs the list to /api/projects/import-from-local in one batch
#   4. Prints the result (created vs skipped)
#
# Duplicates by project name are silently skipped — safe to re-run.

set -euo pipefail

# ── Pre-flight ────────────────────────────────────────────────────────────

: "${FC_TOKEN:?Set FC_TOKEN=ck_... (mint at /settings → Agent tokens)}"

if [[ ! "$FC_TOKEN" =~ ^ck_ ]]; then
  echo "error: FC_TOKEN must start with 'ck_' (got: ${FC_TOKEN:0:6}...)" >&2
  exit 64
fi

for cmd in jq curl git find; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "error: $cmd is required" >&2; exit 1; }
done

API="${FC_API:-https://fleetcrown.orangecat.ch}"
ROOTS="${FC_ROOTS:-$HOME/dev:$HOME/code:$HOME/Code:$HOME/Projects}"
DEPTH="${FC_DEPTH:-3}"

# ── Scan ──────────────────────────────────────────────────────────────────

IFS=':' read -ra ROOT_LIST <<<"$ROOTS"

declare -a folder_objs
scanned=0

for root in "${ROOT_LIST[@]}"; do
  [[ -d "$root" ]] || continue
  while IFS= read -r gitdir; do
    repo="$(dirname "$gitdir")"
    [[ "$repo" == "$root" ]] && continue  # skip if root itself is a repo
    name="$(basename "$repo")"
    remote="$(git -C "$repo" remote get-url origin 2>/dev/null || true)"
    last="$(git -C "$repo" log -1 --format=%cI 2>/dev/null || true)"

    obj="$(jq -nc \
      --arg name "$name" \
      --arg path "$repo" \
      --arg remote "$remote" \
      --arg last "$last" \
      '{name: $name, path: $path}
       + (if $remote != "" then {remote_url: $remote} else {} end)
       + (if $last != ""   then {last_commit_iso: $last} else {} end)')"
    folder_objs+=("$obj")
    scanned=$((scanned + 1))
  done < <(find "$root" -maxdepth "$DEPTH" -type d -name ".git" 2>/dev/null)
done

if [[ $scanned -eq 0 ]]; then
  echo "No git repos found in: ${ROOTS//:/, }"
  echo "Set FC_ROOTS to override (colon-separated)."
  exit 0
fi

echo "→ Found $scanned git repo(s). Importing to $API …"

# ── POST ──────────────────────────────────────────────────────────────────

body="$(jq -nc --argjson f "[$(IFS=,; echo "${folder_objs[*]}")]" '{folders: $f}')"

response="$(curl -sS -X POST "$API/api/projects/import-from-local" \
  -H "Authorization: Bearer $FC_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$body")"

# ── Report ────────────────────────────────────────────────────────────────

if echo "$response" | jq -e '.error' >/dev/null 2>&1; then
  echo "✗ Server rejected the import:"
  echo "$response" | jq .
  exit 1
fi

created="$(echo "$response" | jq '.created | length')"
skipped="$(echo "$response" | jq '.skipped | length')"

echo "✓ Imported $created project(s)$([[ $skipped -gt 0 ]] && echo "  ($skipped skipped — likely duplicates)")"
echo
echo "Open https://fleetcrown.orangecat.ch/control to see them."
