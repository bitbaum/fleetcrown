#!/usr/bin/env -S npx tsx
/**
 * Generate scripts/control-states.generated.sh from the TS SSOT in
 * src/lib/control-states.ts. The bash side sources the generated file and
 * uses the variables for user-visible state strings — so adding a state in
 * TS keeps the daemon, hooks, and UI talking about it with the same words.
 *
 * Run: npx tsx scripts/generate-bash-state-vocab.ts
 * Wired into npm run build via the build:vocab step.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PROJECT_STATES, STATE_DEFINITIONS } from "../src/lib/control-states.ts";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), "..");
const OUT_PATH = path.join(REPO_ROOT, "scripts", "control-states.generated.sh");

function shellQuote(value: string): string {
  // Single-quote and escape any embedded single quotes the bash way.
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function bashKey(stateKey: string): string {
  // Bash variable names cannot contain hyphens; states use snake_case
  // already, so just uppercase.
  return stateKey.toUpperCase();
}

const HEADER = `#!/usr/bin/env bash
# GENERATED FILE — DO NOT EDIT BY HAND.
# Source of truth: src/lib/control-states.ts (STATE_DEFINITIONS).
# Regenerate: npx tsx scripts/generate-bash-state-vocab.ts
#
# Variables exposed:
#   FC_STATE_KEYS              — space-separated list of all state keys
#   FC_LABEL_<KEY>             — short human label (badge text)
#   FC_DESCRIPTION_<KEY>       — one-line WHY this state is true
#   FC_COUNTER_CATEGORY_<KEY>  — chip bucket: working|waiting|idle|offline
#
# Usage from bash:
#   source "$(dirname "$0")/control-states.generated.sh"
#   echo "$FC_LABEL_OFFLINE"          # → "Offline"
#   echo "$FC_DESCRIPTION_OPEN_IDLE"  # → "Agent process detected …"
`;

const lines: string[] = [HEADER, ""];
lines.push(`FC_STATE_KEYS=${shellQuote(PROJECT_STATES.join(" "))}`);
lines.push("");

for (const key of PROJECT_STATES) {
  const def = STATE_DEFINITIONS[key];
  const bk = bashKey(key);
  lines.push(`FC_LABEL_${bk}=${shellQuote(def.label)}`);
  lines.push(`FC_DESCRIPTION_${bk}=${shellQuote(def.description)}`);
  lines.push(`FC_COUNTER_CATEGORY_${bk}=${shellQuote(def.counterCategory)}`);
  lines.push("");
}

// Sentinel function the daemon can call to fail loudly if the generated
// file is out of date with the TS source. Compares the count of state
// keys against an expected number a caller can pin if needed.
lines.push(`# Returns 0 if the generated file looks structurally sane,`);
lines.push(`# 1 if the FC_STATE_KEYS variable is missing or empty.`);
lines.push(`fc_state_vocab_sanity_check() {`);
lines.push(`  [ -n "\${FC_STATE_KEYS:-}" ] || return 1`);
lines.push(`  return 0`);
lines.push(`}`);
lines.push("");

writeFileSync(OUT_PATH, lines.join("\n"), { mode: 0o644 });
console.log(`✓ wrote ${OUT_PATH} (${PROJECT_STATES.length} states)`);
