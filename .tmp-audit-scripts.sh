#!/bin/bash
cd /home/g/dev/fleetcrown/.claude/worktrees/feedback-soc-redesign
node -e "console.log(Object.keys(require('./package.json').scripts).join('\n'))" | sort > /tmp/fc-scripts.txt
grep -rhoE 'npm run [a-z0-9:_-]+' docs/ | sed 's/npm run //' | sort -u > /tmp/fc-doc-scripts.txt
echo "=== npm scripts named in docs that DO NOT exist ==="
comm -23 /tmp/fc-doc-scripts.txt /tmp/fc-scripts.txt | while read -r s; do
  echo "--- $s"
  grep -rn --include='*.md' "npm run $s" docs/ | head -4
done
