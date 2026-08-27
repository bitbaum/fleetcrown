#!/usr/bin/env bash
# _box-env.sh — SSOT for the studio's environment constants. Source, don't execute.
#
# Every value here is one somebody will eventually want to change: the box moves,
# the GitHub owner becomes an organisation, the domain changes. Each one lives
# ONCE, and every script derives from it. No side effects — safe to source
# anywhere.
#
# Anything that cannot read these — GitHub Actions `uses:` requires a literal
# owner/repo and will not accept a variable — is swept by
# scripts/ci/sweep-gh-owner.sh, which exists so a rename is one command rather
# than forty-one edits.
HETZNER_IP="${HETZNER_IP:-167.233.22.31}"
BOX_ROOT="root@${HETZNER_IP}"
BOX_UBUNTU="ubuntu@${HETZNER_IP}"

# WHERE NEW SITE REPOS ARE CREATED. Becomes an org the day one exists.
GH_OWNER="${GH_OWNER:-catomean}"

# WHERE fleetcrown LIVES — the owner every site's deploy.yml points at in its
# `uses:` line. Deliberately separate from GH_OWNER: these look like the same
# value today and are about to diverge. Sites will be created under an org
# (bitbaum) while fleetcrown stays on the personal account, and if that account
# is ever renamed this changes and GH_OWNER does not.
WORKFLOW_OWNER="${WORKFLOW_OWNER:-catomean}"

# The domain every site gets a free subdomain on, until it has its own.
SITES_BASE_DOMAIN="${SITES_BASE_DOMAIN:-orangecat.ch}"

# Where local checkouts live.
DEV_ROOT="${DEV_ROOT:-/home/g/dev}"
