/**
 * Generate ~/.config/agent-prompts.json from src/config/prompt-library.ts.
 *
 * The runner (scripts/agent-hook-bridge.sh and friends) reads the JSON file
 * directly from disk via `get_prompt`. The TS PROMPT_TEMPLATES file is the
 * SSOT — this script is the build bridge that keeps the runner working
 * while we incrementally migrate prompts out of legacy JSON.
 *
 * Behavior:
 *   - Reads existing JSON (if present) — entries NOT covered by TS agentKey
 *     are preserved verbatim. This means legacy prompts that haven't been
 *     migrated to TS yet still work; the runner doesn't lose them.
 *   - TS entries with agentKey set are transformed to AgentPrompt shape and
 *     either added or replace the matching JSON entry.
 *   - Writes the merged set back to ~/.config/agent-prompts.json with a
 *     stable key order so diffs are reviewable.
 *
 * Run: npm run generate:agent-prompts
 *      (or: npx tsx scripts/generate-agent-prompts.ts)
 *
 * The user should re-run this whenever they edit prompt-library.ts entries
 * with agentKey set. Future: hook into next.config build step or a pre-push
 * husky hook so it's automatic.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { PROMPT_TEMPLATES } from "../src/config/prompt-library";

type AgentPrompt = {
  key: string;
  slot: number | null;
  icon: string;
  label: string;
  style: string;
  category: string;
  dimensionId: string | null;
  prompt: string;
  sendNow?: boolean;
};

const JSON_PATH =
  process.env.AGENT_PROMPTS_FILE ?? join(homedir(), ".config", "agent-prompts.json");

function loadExisting(): AgentPrompt[] {
  if (!existsSync(JSON_PATH)) return [];
  try {
    return JSON.parse(readFileSync(JSON_PATH, "utf-8"));
  } catch (e) {
    console.error(`[generate-agent-prompts] failed to parse ${JSON_PATH}:`, e);
    return [];
  }
}

function transformTsEntry(t: (typeof PROMPT_TEMPLATES)[number]): AgentPrompt | null {
  if (!t.agentKey) return null;
  return {
    key: t.agentKey,
    slot: t.slot ?? null,
    icon: t.icon ?? "•",
    label: t.name,
    style: t.style ?? "dimension",
    category: t.category,
    dimensionId: t.dimensionId ?? null,
    prompt: t.template,
    ...(t.sendNow !== undefined ? { sendNow: t.sendNow } : {}),
  };
}

function main(): void {
  const existing = loadExisting();
  const tsTransformed = PROMPT_TEMPLATES.map(transformTsEntry).filter(
    (p): p is AgentPrompt => p !== null,
  );

  const byKey = new Map<string, AgentPrompt>();
  for (const p of existing) byKey.set(p.key, p);
  for (const p of tsTransformed) byKey.set(p.key, p); // TS wins on conflict

  // Sort by slot (defined first), then alphabetically by key. Makes the
  // diff readable when a single prompt changes.
  const merged = [...byKey.values()].sort((a, b) => {
    const sa = a.slot ?? 999;
    const sb = b.slot ?? 999;
    if (sa !== sb) return sa - sb;
    return a.key.localeCompare(b.key);
  });

  const before = existing.length;
  const after = merged.length;
  const overridden = tsTransformed.filter((t) => existing.some((e) => e.key === t.key)).length;
  const added = tsTransformed.length - overridden;
  const untouched = existing.filter((e) => !tsTransformed.some((t) => t.key === e.key)).length;

  writeFileSync(JSON_PATH, JSON.stringify(merged, null, 2) + "\n", "utf-8");

  console.log(`[generate-agent-prompts] wrote ${after} entries to ${JSON_PATH}`);
  console.log(`  before: ${before} JSON entries`);
  console.log(`  TS entries with agentKey: ${tsTransformed.length}`);
  console.log(`    ↳ overrode existing JSON: ${overridden}`);
  console.log(`    ↳ newly added: ${added}`);
  console.log(`  legacy JSON entries preserved: ${untouched}`);
}

main();
