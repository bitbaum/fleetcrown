/**
 * Does every model id this app pins still EXIST at its provider?
 *
 * The cheap half of model-rot defence. `probe:models` answers "can this model
 * drive the tool loop" and costs real tokens; this answers "is it still there
 * at all" with one GET /models per provider and zero tokens — cheap enough to
 * run on a schedule, which is the point. The 2026-08-18 rot of
 * `llama-3.3-70b-versatile` went eight days unnoticed because the only
 * existing check was a command someone had to remember to type.
 *
 * Exit 1 when any registered id is missing, so it can gate or alarm.
 *
 * Run: npx tsx scripts/check-model-ids.ts   (npm run check:models)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { REGISTERED_MODELS, registeredIdsFor, type ModelProvider } from "../src/config/model-registry";

const ENDPOINTS: Record<ModelProvider, { url: string; keyEnv: string }> = {
  groq: { url: "https://api.groq.com/openai/v1/models", keyEnv: "GROQ_API_KEY" },
  openrouter: { url: "https://openrouter.ai/api/v1/models", keyEnv: "OPENROUTER_API_KEY" },
};

/** Live ids at a provider, or null when we could not look (no key, network,
 *  non-200). Null is NOT an empty list: reporting "everything is missing"
 *  because the request failed is how a checker invents an outage. */
async function liveIds(provider: ModelProvider): Promise<Set<string> | null> {
  const { url, keyEnv } = ENDPOINTS[provider];
  const key = process.env[keyEnv];
  if (!key) return null;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: Array<{ id?: unknown }> };
    if (!Array.isArray(body?.data)) return null;
    return new Set(body.data.map((m) => String(m?.id)).filter(Boolean));
  } catch {
    return null;
  }
}

async function main() {
  const providers = [...new Set(REGISTERED_MODELS.map((m) => m.provider))];
  let missing = 0;
  let unchecked = 0;

  for (const provider of providers) {
    const live = await liveIds(provider);
    const ids = registeredIdsFor(provider);

    if (!live) {
      // Could-not-look is its own state, distinct from "all present" and from
      // "all missing". Never let it read as a pass OR as an outage.
      console.log(`? ${provider}: could not read the model list (no key, or the request failed) — ${ids.length} id(s) UNCHECKED`);
      unchecked += ids.length;
      continue;
    }

    for (const id of ids) {
      if (live.has(id)) {
        console.log(`✓ ${provider}/${id}`);
        continue;
      }
      missing++;
      const users = REGISTERED_MODELS.filter((m) => m.provider === provider && m.id === id);
      console.error(`✗ ${provider}/${id} — GONE from the provider's model list`);
      for (const u of users) console.error(`    breaks: ${u.usedFor}`);
    }
  }

  console.log("");
  if (missing > 0) {
    console.error(`${missing} pinned model id(s) no longer exist. Pick a live one and re-probe before shipping.`);
    process.exit(1);
  }
  if (unchecked > 0) {
    console.log(`All checked ids exist. ${unchecked} could not be checked — that is not a pass for them.`);
    return;
  }
  console.log(`All ${REGISTERED_MODELS.length} registered model id(s) exist at their provider.`);
}

void main();
