#!/usr/bin/env bash
# _box-env.sh — SSOT for the Hetzner box address. Source, don't execute.
# Override with HETZNER_IP=<ip> in the environment; BOX_ROOT / BOX_UBUNTU
# derive from it. No side effects — safe to source from any script.
HETZNER_IP="${HETZNER_IP:-167.233.22.31}"
BOX_ROOT="root@${HETZNER_IP}"
BOX_UBUNTU="ubuntu@${HETZNER_IP}"
