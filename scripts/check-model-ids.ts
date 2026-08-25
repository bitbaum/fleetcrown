/**
 * Does every model id this app pins still EXIST at its provider?
 *
 * The cheap half of model-rot defence. `probe:models` answers "can this model
 * drive the tool loop" and costs real tokens; this answers "is it still there
 * at all" with one GET /models per provider and zero tokens.
 *
 * The detection logic itself lives in `src/lib/model-check.ts`, shared with the
 * `check-model-ids` CRON that runs this on the clock. This file is only the
 * human-facing rendering of that verdict — because the 2026-08-18 rot went
 * eight days unnoticed precisely because the only check was a command someone
 * had to remember to type.
 *
 * Exit 1 when any registered id is missing, so it can gate or alarm.
 *
 * Run: npx tsx scripts/check-model-ids.ts   (npm run check:models)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { checkRegisteredModels } from "../src/lib/model-check";
import { REGISTERED_MODELS } from "../src/config/model-registry";

async function main() {
  const report = await checkRegisteredModels();

  for (const p of report.providers) {
    if (!p.reachable) {
      // Could-not-look is its own state, distinct from "all present" and from
      // "all missing". Never let it read as a pass OR as an outage.
      console.log(
        `? ${p.provider}: could not read the model list (no key, or the request failed) — ${p.uncheckedIds.length} id(s) UNCHECKED`,
      );
      continue;
    }
    for (const id of p.presentIds) console.log(`✓ ${p.provider}/${id}`);
    for (const m of p.missing) {
      console.error(`✗ ${m.provider}/${m.id} — GONE from the provider's model list`);
      console.error(`    breaks: ${m.usedFor}`);
    }
  }

  console.log("");
  if (report.missing.length > 0) {
    console.error(
      `${report.missing.length} pinned model id(s) no longer exist. Pick a live one and re-probe before shipping.`,
    );
    process.exit(1);
  }
  if (report.uncheckedIds.length > 0) {
    console.log(
      `All checked ids exist. ${report.uncheckedIds.length} could not be checked — that is not a pass for them.`,
    );
    return;
  }
  console.log(`All ${REGISTERED_MODELS.length} registered model id(s) exist at their provider.`);
}

void main();
