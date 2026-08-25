/**
 * Does every model id this app pins still EXIST at its provider?
 *
 * SSOT for model-rot detection. Two callers share it — `npm run check:models`
 * (a human types it) and the `check-model-ids` cron (the clock types it) — so
 * the scheduled check and the manual one can never disagree about what "rot"
 * means. That mattered here: the previous answer to model rot was a script
 * someone had to remember to run, and `llama-3.3-70b-versatile` was dead for
 * eight days because nobody did.
 *
 * Costs ZERO tokens: one GET /models per provider, no inference. That is the
 * whole reason it is safe to schedule — the Groq free tier is 100k tokens/DAY
 * org-wide, shared by every feature, so a monitor that spends tokens competes
 * with the product for the resource it is supposed to protect.
 */

import {
  REGISTERED_MODELS,
  registeredIdsFor,
  type ModelProvider,
  type RegisteredModel,
} from "@/config/model-registry";

export const MODEL_ENDPOINTS: Record<ModelProvider, { url: string; keyEnv: string }> = {
  groq: { url: "https://api.groq.com/openai/v1/models", keyEnv: "GROQ_API_KEY" },
  openrouter: { url: "https://openrouter.ai/api/v1/models", keyEnv: "OPENROUTER_API_KEY" },
};

/** Reads one provider's catalogue. `null` means WE COULD NOT LOOK (no key,
 *  network failure, non-200, unparseable body) — deliberately not an empty
 *  set. Treating a failed fetch as "the catalogue is empty" would report every
 *  pinned model as dead and invent an outage out of our own network blip. */
export type CatalogReader = (provider: ModelProvider) => Promise<Set<string> | null>;

export const fetchCatalog: CatalogReader = async (provider) => {
  const { url, keyEnv } = MODEL_ENDPOINTS[provider];
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
    const ids = new Set(body.data.map((m) => String(m?.id)).filter(Boolean));
    // A syntactically valid but EMPTY catalogue is likelier to be a provider
    // glitch than the simultaneous death of every model, and treating it as
    // truth would raise a maximally alarming false alert. Refuse to judge.
    return ids.size === 0 ? null : ids;
  } catch {
    return null;
  }
};

export type ProviderCheck = {
  provider: ModelProvider;
  /** False = catalogue unreadable; `missing` is then meaningless and empty. */
  reachable: boolean;
  presentIds: string[];
  missing: RegisteredModel[];
  uncheckedIds: string[];
};

export type ModelCheckReport = {
  providers: ProviderCheck[];
  /** Pins confirmed absent from a catalogue we successfully read. */
  missing: RegisteredModel[];
  /** Pins we could not judge either way. Never a pass, never a failure. */
  uncheckedIds: string[];
  presentCount: number;
};

export async function checkRegisteredModels(read: CatalogReader = fetchCatalog): Promise<ModelCheckReport> {
  const providers = [...new Set(REGISTERED_MODELS.map((m) => m.provider))];
  const results: ProviderCheck[] = [];

  for (const provider of providers) {
    const live = await read(provider);
    const ids = registeredIdsFor(provider);

    if (!live) {
      results.push({ provider, reachable: false, presentIds: [], missing: [], uncheckedIds: ids });
      continue;
    }

    const presentIds = ids.filter((id) => live.has(id));
    const deadIds = ids.filter((id) => !live.has(id));
    const missing = REGISTERED_MODELS.filter((m) => m.provider === provider && deadIds.includes(m.id));
    results.push({ provider, reachable: true, presentIds, missing, uncheckedIds: [] });
  }

  return {
    providers: results,
    missing: results.flatMap((r) => r.missing),
    uncheckedIds: results.flatMap((r) => r.uncheckedIds),
    presentCount: results.reduce((n, r) => n + r.presentIds.length, 0),
  };
}

/** One-line-per-casualty text for an alert body: the id, and what it breaks. */
export function describeRot(report: ModelCheckReport): string {
  return report.missing
    .map((m) => `${m.provider}/${m.id} — breaks: ${m.usedFor}`)
    .join("\n");
}
