#!/usr/bin/env bash
#
# Every LIVE client engagement must have recorded commercial terms.
# Ratcheted: the count may fall, never rise.
#
# WHY
#
# apps.conf carries plan/price/since columns that were added before the numbers
# existed, on the explicit reasoning that "the gaps are the point — right now
# 'what am I owed this month' and 'what am I maintaining for free' are
# unanswerable, which is why these columns exist before the numbers do".
#
# That reasoning was right and nothing acted on it. Every one of the 15 rows
# still reads plan=- price=-, including four client sites running in production
# for a paying-or-not counterparty: kivvi (RevampIT), aoz-wohnen (AOZ),
# vitareba (clinic) and sink (S-Ink). The columns made the gap RECORDABLE; they
# did not make it VISIBLE, and nothing ever read them, so eight months of `-`
# looked exactly like eight months of "no clients". This file is the reader.
#
# It is deliberately not a nag. A daily message about a number that does not
# change is how alerts get muted (see scripts/local/fleet-register-check for
# what that cost already). It fires at the one moment the answer is cheap and
# someone is definitely thinking about it: the PR that puts a client app live.
#
# WHY THE PREDICATE IS THIS NARROW
#
#   kind ∈ {client-app, client-site}  — products we own owe nobody an invoice.
#   status = live                     — a prospect with no price is honest; a
#                                       LIVE engagement with no price is work
#                                       being done for an unknown amount.
#
# printcraft (prospect) and reparaturbonus-zh (unverified) are therefore NOT
# counted. They are printed anyway, under "not yet counted", because a gate
# whose near-misses are invisible teaches you the number is the whole truth.
#
# A ratchet, not a zero-check: four live engagements predate this file and
# blocking every unrelated PR until George remembers four prices would make the
# gate the problem. New ones must arrive with terms.
set -euo pipefail

# Resolved and USED before sourcing lib.sh, which sets its own $HERE and would
# otherwise repoint BASELINE_FILE at scripts/hetzner/ — the exact collision that
# made the deploy-ready ratchet read a missing file and pass unconditionally.
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
BASELINE_FILE="$SELF_DIR/client-ledger.baseline"

. "$SELF_DIR/../hetzner/lib.sh"

missing=""; counted=0; deferred=""; unverified=""

# Every field is named. bash assigns the remainder of the line to the LAST
# variable, so a short read here would make $since carry "since|whatever-comes-
# next" the day a column is appended — silently, and only for this file.
while IFS='|' read -r name port domains repo appdir db owner kind status plan price since; do
  case "$name" in \#*|"") continue ;; esac
  case "$kind" in client-app|client-site) ;; *) continue ;; esac

  # An owner the register itself marks as a guess ("Stadt Zürich?"). Reported,
  # never counted: the trailing ? is the author being honest, not a defect.
  case "$owner" in *\?) unverified="$unverified $name" ;; esac

  if [ "$status" != live ]; then
    # Written as an if, not `a || b && c`: under `set -e` that compound exits
    # the script the first time BOTH tests are false, which is the common case.
    if [ "$plan" = "-" ] || [ "$price" = "-" ]; then
      deferred="$deferred $name:$status"
    fi
    continue
  fi

  counted=$((counted + 1))
  if [ "$plan" = "-" ] || [ "$price" = "-" ]; then
    missing="$missing $name"
  fi
done < <(grep -v '^#' "$MANIFEST")

count=$(echo $missing | wc -w | tr -d ' ')
baseline=$(cat "$BASELINE_FILE" 2>/dev/null || echo "$count")

failed=0
if [ "$count" -gt "$baseline" ]; then
  echo "✗ $count live client engagement(s) have no recorded terms, up from a baseline of $baseline:"
  for m in $missing; do
    echo "    $m — running in production for a client, plan and price unrecorded"
  done
  echo
  echo "  A new live client engagement without terms is a regression: it is work"
  echo "  being done for an amount nobody can state. Fill plan and price in"
  echo "  scripts/hetzner/apps.conf — '-' is reserved for NOT KNOWN, and this"
  echo "  gate exists because 'not known' stopped being temporary."
  failed=1
elif [ "$count" -gt 0 ]; then
  echo "✓ client ledger: $count of $counted live engagement(s) still without terms:$missing"
else
  echo "✓ client ledger: all $counted live client engagement(s) have recorded terms"
fi

# The banking note is its own statement, not an alternative to the one above.
# Folded into the branches, reaching zero printed ONLY "lower the baseline" —
# so the one outcome worth naming out loud, every live engagement priced, was
# the single state the gate could not say. Its own test caught that.
if [ "$count" -lt "$baseline" ]; then
  echo "  down from a baseline of $baseline — bank it:"
  echo "    echo $count > $BASELINE_FILE"
elif [ "$failed" = 0 ] && [ "$count" -gt 0 ]; then
  echo "  at baseline — no regression, but nothing recovered either."
fi

# Announced, not silently skipped — the near-misses are the pipeline of rows
# that WILL be counted the day their status flips to live.
[ -n "$deferred" ] && echo "  not yet counted (terms unrecorded, not live):$deferred"
[ -n "$unverified" ] && echo "  owner recorded as a guess:$unverified"

[ "$failed" = 0 ]
