#!/bin/bash
cd /home/g/dev/fleetcrown/.claude/worktrees/feedback-soc-redesign
grep -rhoE '`[a-zA-Z0-9_./@-]+\.(ts|tsx|sh|mjs|json|css|py|service|yml)`' docs/ | tr -d '`' | sort -u | while read -r p; do
  [ -e "$p" ] && continue
  base=$(basename "$p")
  if find src home desktop scripts packages content .github -name "$base" 2>/dev/null | head -1 | grep -q .; then continue; fi
  hits=$(grep -rln --include='*.md' -F "$p" docs/ | tr '\n' ' ')
  echo "MISSING: $p  <- $hits"
done
