#!/usr/bin/env bash
#
# Does every registered site's widget actually ACTIVATE?
#
# WHY
#
# A widget token is bound to an origin, so a token leaked from a page cannot be
# replayed elsewhere. That binding is written once, at provisioning, and never
# looked at again — while the host is renamed whenever a project is renamed.
#
# When the two disagree the widget does not error. `widget.js` loads (200),
# `/api/widget-boot` authenticates (200) and answers `{"active":false}`, and the
# launcher never mounts. Nothing is logged. The page looks finished.
#
# Found 2026-09-11 on two live sites, both renamed months earlier:
#
#   aoz-housing      bound to https://aoz-wohnen.orangecat.ch   served at aoz.orangecat.ch
#   sbb-lost-found   bound to https://sbb.orangecat.ch          served at sbbfundbuero.orangecat.ch
#
# Both had a working widget at provisioning. Both silently lost it at the
# rename, and the fix needed no redeploy — only a rebind.
#
# WHAT THIS ASKS, AND WHY NOT THE OBVIOUS THING
#
# The first version compared each token's `origins` against the register's
# hosts. It flagged four sites that were completely fine: annushka and
# orangecat.ch are not register rows but serve working widgets, fleetcrown does
# not put a widget on itself, and one token belonged to an OrangeCat project
# page that is not a hosted site at all. The register is not the universe of
# hosts with widgets, so "origins ⊆ register" was never the property.
#
# So ask the site. For each registered host: fetch the page, take the token out
# of it, and ask widget-boot — with that host as Origin — whether it activates.
# One fetch and one call per site, no database, and it catches every way a
# widget can be dead (absent, revoked, inactive, origin-rotted) rather than the
# one way it can be mis-bound.
#
# The token is injected CLIENT-SIDE by next/script, so it appears in the HTML
# only inside Next's flight payload, escaped: \"data-fc-project\":\"fcw_…\".
# An earlier sweep matched `data-fc-project="[^"]+"` and reported four false
# negatives on sites whose widgets were working. Match the token itself.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
MANIFEST="${MANIFEST:-$HERE/../hetzner/apps.conf}"
FC_BASE="${FC_BASE:-https://fleetcrown.orangecat.ch}"
TIMEOUT="${WIDGET_CHECK_TIMEOUT:-15}"

[ -r "$MANIFEST" ] || { echo "✗ check-widget-origins: no register at $MANIFEST"; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "· check-widget-origins: SKIPPED — no curl"; exit 0; }

# Reachability first. Offline, every site would look dead and this would report
# a fleet-wide outage — a check that cannot see must say so, not fail loudly.
if ! curl -sSf -o /dev/null --max-time "$TIMEOUT" "$FC_BASE/widget.js" 2>/dev/null; then
  echo "· check-widget-origins: SKIPPED — cannot reach $FC_BASE/widget.js from here."
  exit 0
fi

dead=""; live=0; nowidget=""
while IFS='|' read -r name _port hosts _rest; do
  case "$name" in ''|'#'*) continue ;; esac
  host="${hosts%%,*}"
  [ -n "$host" ] || continue

  page="$(curl -sSL --max-time "$TIMEOUT" "https://$host/" 2>/dev/null)" || { dead="$dead $name(unreachable)"; continue; }
  token="$(grep -oE 'fcw_[A-Za-z0-9]+' <<< "$page" | head -1)"
  if [ -z "$token" ]; then
    # NOT "no widget". Only "no token in the server HTML", which is a third
    # answer and must not be reported as the second.
    #
    # surf-your-life and evig land here and BOTH have working widgets: one
    # preloads widget.js and attaches the token client-side, the other injects
    # the whole tag after hydration, so neither puts `fcw_` in the markup. An
    # earlier sweep called exactly this "widget: NO" on four sites that were
    # fine. Say what was actually observed, and do not fail on it.
    nowidget="$nowidget $name"
    continue
  fi

  boot="$(curl -sS --max-time "$TIMEOUT" -H "Origin: https://$host" \
          "$FC_BASE/api/widget-boot?token=$token" 2>/dev/null)"
  case "$boot" in
    *'"active":true'*) live=$((live + 1)) ;;
    *'"active":false'*) dead="$dead $name" ;;
    *) dead="$dead $name(boot:${boot:-no-response})" ;;
  esac
done < "$MANIFEST"

if [ -n "$nowidget" ]; then
  echo "· token not present in the server HTML — NOT judged either way:"
  for n in $nowidget; do echo "    $n"; done
  echo "  A site that attaches the token after hydration looks identical here to"
  echo "  one with no widget at all. Confirm these in a browser, not with curl."
fi

if [ -n "$dead" ]; then
  echo "✗ registered sites whose widget does NOT activate:"
  for n in $dead; do echo "    $n"; done
  echo "  This state is silent: widget.js 200, widget-boot 200 {\"active\":false},"
  echo "  launcher never mounts, nothing logged. Usually the token's origin"
  echo "  outlived a rename. Rebind — the token value does not change, so no"
  echo "  redeploy is needed:"
  echo "    bash scripts/hetzner/provision-widget-on-box.sh <name> '<FC project title>' <current-host>"
  exit 1
fi

# A silent pass must mean something was actually checked.
if [ "$live" = 0 ]; then
  echo "✗ check-widget-origins: 0 sites had an active widget — the token pattern or the register moved."
  exit 1
fi

echo "✓ widget: $live registered site(s) activate"
