#!/usr/bin/env bash
# data-deps.sh — which datastore does each app on the box ACTUALLY use?
#
# WHY THIS EXISTS: on 2026-08-29 the question "is anything still using the
# Supabase stack?" was answered by grepping DATABASE_URL across every app env.
# Every hit pointed at localhost:5432, so the answer looked like "nothing" —
# and stopping the stack was one command from taking orangecat and botsmann
# down, with 114 auth users and 927 messages behind it.
#
# The reasoning error: a Supabase app never sets DATABASE_URL. It talks HTTPS
# to PostgREST/Kong via SUPABASE_URL. The absence of a Postgres connection
# string is not the absence of a dependency — it is the signature of a
# DIFFERENT one. Grepping for one binding and concluding "unused" reads
# absence as an answer.
#
# It also reports whether a Postgres target actually holds tables, because an
# empty database is worse than a missing one: `orangecat` exists in the native
# cluster with ZERO tables, a leftover pointing nowhere, and a reader who sees
# the name assumes the app lives there.
#
# Usage: bash data-deps.sh    (read-only; answers "is X safe to stop?")
set -u
export LC_ALL=C

# strip: key=, quotes, scheme, then CREDENTIALS (everything up to the last @),
# then any query string. Order matters — stripping the path before the
# credentials mangles a postgres URL into the scheme.
hostof() { sed 's#^[^=]*=##; s#^"##; s#"$##; s#^[a-z+]*://##; s#^.*@##; s#?.*$##'; }
hostonly() { hostof | sed 's#/.*##'; }

printf '%-22s %-34s %-26s %s\n' APP POSTGRES SUPABASE VERDICT
printf '%-22s %-34s %-26s %s\n' "---" "---" "---" "---"
for d in /opt/*/; do
  app=$(basename "$d")
  case "$app" in _appcron|backups|monitoring|supabase) continue ;; esac
  f="$d/shared/.env"; [ -f "$f" ] || f="$d/app/.env"; [ -f "$f" ] || continue
  # app/.env may be a symlink to shared/.env; reading one is enough either way.

  pg=$(grep -m1 '^DATABASE_URL=' "$f" 2>/dev/null | hostof)
  sb=$(grep -m1 -E '^(NEXT_PUBLIC_)?SUPABASE_URL=' "$f" 2>/dev/null | hostonly)

  # does the postgres target actually contain anything?
  pgnote=""
  if [ -n "$pg" ]; then
    db=${pg##*/}
    n=$(sudo -u postgres psql -d "$db" -tAc \
        "select count(*) from information_schema.tables where table_schema='public';" 2>/dev/null | tr -d ' ')
    [ -n "$n" ] && [ "$n" = "0" ] && pgnote=" [EMPTY — decoy]"
  fi

  if   [ -n "$sb" ] && [ -n "$pg" ]; then v="supabase (postgres var is a fossil)"
  elif [ -n "$sb" ];                 then v="supabase"
  elif [ -n "$pg" ];                 then v="native postgres"
  else                                    v="no datastore configured"
  fi
  printf '%-22s %-34s %-26s %s\n' "$app" "${pg:-—}$pgnote" "${sb:-—}" "$v"
done
