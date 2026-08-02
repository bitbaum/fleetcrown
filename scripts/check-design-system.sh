#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

fail=0
checks_run=0

# This gate silently passed for its entire life: `rg` is not installed on the
# GitHub runner, so every `if rg ...` saw exit 127 — indistinguishable from
# "no matches" — and the script printed "ok" while scanning nothing. A gate
# that cannot tell "tool missing" from "clean" is worse than no gate, because
# it manufactures confidence. Fail loudly instead.
if ! command -v rg >/dev/null 2>&1; then
  echo "design-system check FAILED: ripgrep (rg) is not installed." >&2
  echo "This gate scans nothing without it. Install ripgrep in CI and locally." >&2
  exit 1
fi

check_none() {
  local label="$1"
  local pattern="$2"
  shift 2
  local files=("$@")

  checks_run=$((checks_run + 1))

  # rg exits 0 on match, 1 on no-match, >1 on error. Only exit 1 means clean —
  # anything else (bad glob, unreadable path) must not read as a pass.
  local out status
  out="$(rg -n "$pattern" "${files[@]}" 2>&1)" && status=0 || status=$?

  if [[ "$status" -eq 0 ]]; then
    echo "$out"
    echo
    echo "design-system check failed: $label"
    fail=1
  elif [[ "$status" -ne 1 ]]; then
    echo "design-system check ERRORED (rg exit $status) on: $label" >&2
    echo "$out" >&2
    fail=1
  fi
}

check_none "custom ui-* classes used inside @apply in TSX" '@apply .*ui-' src/components src/app -g '*.tsx'
check_none "raw shared search input recipe outside primitive" 'w-full rounded-2xl border border-border-default bg-surface-overlay .*pl-11 .*pr-16' src/components src/app -g '!src/app/globals.css'
check_none "raw code-surface recipe outside primitive" 'rounded-\[1\.5rem\] border border-border-subtle bg-surface-overlay p-4 .*leading-relaxed text-text-secondary' src/components src/app -g '!src/app/globals.css'
check_none "raw subtle link text recipe outside primitive" 'text-xs text-text-tertiary .*hover:text-text-secondary' src/components src/app -g '!src/app/globals.css'

# Layer 4: JSX must not use raw palette or white-opacity utilities — auth/public
# tokens live in globals.css ui-auth-* / ui-public-* / ui-brand-* classes.
check_none "raw palette colors in components" 'text-gray-|text-slate-|text-zinc-|text-blue-|text-green-|text-red-|text-purple-|text-yellow-|text-orange-|text-cyan-|text-violet-|bg-gray-|bg-blue-|bg-green-|bg-red-|bg-\[#|text-\[#|text-\[1[0-9]px\]|text-\[8px\]' src/components src/app -g '*.tsx' -g '!**/opengraph-image.tsx'
check_none "raw white opacity utilities in JSX" 'text-white/|bg-white/|border-white/' src/components src/app -g '*.tsx' -g '!**/opengraph-image.tsx'

if [[ "$fail" -ne 0 ]]; then
  exit 1
fi

# Print what was actually scanned: "0 checks run" must look different from
# "0 violations found" at a glance.
echo "design-system check: ok ($checks_run checks run)"
