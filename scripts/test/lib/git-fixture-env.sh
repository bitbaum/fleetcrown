#!/usr/bin/env bash
# The environment a git fixture suite must run in. Sourced, never executed.
#
#   TMP="$(mktemp -d)"
#   source "$SCRIPT_DIR/lib/git-fixture-env.sh"
#
# Why this is one file instead of a paragraph copied into each suite: it was a
# paragraph copied into each suite, the copies drifted, and the drift is the
# whole hazard. deploy-ref-gate.sh and not-behind-gate.sh both carry scars from
# 2026-08-15, when a fixture suite ran against the real checkout and pushed a
# single-file tree over `main` on GitHub. Each was then hardened separately, so
# each knew something the other did not. A third suite would have copied
# whichever it happened to sit next to.
#
# What must hold before a fixture may touch git:
#
#   1. No inherited pointer to a real repository. The husky pre-push hook
#      exports GIT_DIR (for a worktree, .git/worktrees/<name>). An explicit
#      GIT_DIR is not a search path, so GIT_CEILING_DIRECTORIES does not
#      constrain it — and a per-command toplevel assertion cannot see it either:
#      with GIT_DIR set and no work tree, `git -C <fixture> rev-parse
#      --show-toplevel` answers `<fixture>`, matching perfectly while every
#      object and ref lands in the real repo. Cleared from git's own list so it
#      cannot fall behind a new variable.
#   2. No upward search past $TMP. A broken fixture must find NO repo rather
#      than the enclosing one.
#   3. $TMP must not sit inside a repo. TMPDIR is inherited and some runners
#      point it at the workspace.
#   4. Identity and hook suppression from the ENVIRONMENT only. `git config`
#      is what escaped last time: a fixture's `config core.hooksPath /dev/null`
#      landed in the SHARED .git/config and silently disabled husky for the main
#      checkout and every worktree.
#
# Callers still own their own g() — asserting per command that the directory
# about to be mutated is the fixture — because their fixture shapes differ.

[ -n "${TMP:-}" ] && [ -d "$TMP" ] || {
  echo "  ✗ git-fixture-env: \$TMP must be set to an existing dir before sourcing" >&2
  exit 1
}

# 1. Drop every ambient git variable (GIT_DIR, GIT_INDEX_FILE, GIT_WORK_TREE, …).
for _v in $(git rev-parse --local-env-vars 2>/dev/null); do unset "$_v"; done
unset GIT_PREFIX

# 3. Only meaningful once 1 has run: with GIT_DIR set, an empty mktemp dir reads
#    as a repository root and this check fires with a misleading reason.
if git -C "$TMP" rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "  ✗ refusing to run: temp dir '$TMP' is inside a git repo ($(git -C "$TMP" rev-parse --show-toplevel))" >&2
  exit 1
fi

# 2 and 4.
export GIT_CEILING_DIRECTORIES="$TMP"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
export GIT_AUTHOR_NAME=fixture GIT_AUTHOR_EMAIL=fixture@invalid
export GIT_COMMITTER_NAME=fixture GIT_COMMITTER_EMAIL=fixture@invalid
