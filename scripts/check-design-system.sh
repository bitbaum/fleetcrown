#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

fail=0

check_none() {
  local label="$1"
  local pattern="$2"
  shift 2
  local files=("$@")

  if rg -n "$pattern" "${files[@]}"; then
    echo
    echo "design-system check failed: $label"
    fail=1
  fi
}

check_none "custom ui-* classes used inside @apply" '@apply .*ui-' src/app/globals.css
check_none "raw shared search input recipe outside primitive" 'w-full rounded-2xl border border-border-default bg-surface-overlay .*pl-11 .*pr-16' src/components src/app -g '!src/app/globals.css'
check_none "raw code-surface recipe outside primitive" 'rounded-\[1\.5rem\] border border-border-subtle bg-surface-overlay p-4 .*leading-relaxed text-text-secondary' src/components src/app -g '!src/app/globals.css'
check_none "raw subtle link text recipe outside primitive" 'text-xs text-text-tertiary .*hover:text-text-secondary' src/components src/app -g '!src/app/globals.css'

if [[ "$fail" -ne 0 ]]; then
  exit 1
fi

echo "design-system check: ok"
