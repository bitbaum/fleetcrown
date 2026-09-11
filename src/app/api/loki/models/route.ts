/**
 * What the composer's model picker is allowed to offer.
 *
 * ── Why this is a list of STARTING POINTS, not a pin ─────────────────────────
 * Loki does not run on a model, it runs on a CHAIN: strongest first, stepping
 * across vendors when one rots or runs dry (see config/chat-models.ts). A picker
 * that hard-pinned a model would reintroduce the single point of failure the
 * chain exists to remove. So a choice here names where the chain STARTS —
 * `chainFrom()` already has exactly that semantic — and the fallback below it
 * stays intact. The UI says so rather than implying a pin.
 *
 * ── Locked rows are real, never fake-enabled ─────────────────────────────────
 * A vendor whose key is not set is listed and disabled, with the reason. Hiding
 * it would answer "why can't I use X?" with silence; enabling it would answer
 * with a failed turn.
 */
import { getApiUserId } from "@/lib/session";
import { jsonOk, jsonError } from "@/lib/api/route-helpers";
import { CHAT_CHAIN, providerModels, usableChatChain } from "@/config/chat-models";
import type { LokiModelOption, LokiModelsResponse } from "@/lib/loki/models";

export async function GET() {
  const userId = await getApiUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const usable = usableChatChain();
  const reachable = new Set(usable.map((l) => `${l.provider.id}/${l.model}`));

  // Walk the CONFIGURED chain, not just the usable one, so a vendor without a
  // key still appears — as locked.
  const options: LokiModelOption[] = [];
  for (const provider of CHAT_CHAIN) {
    const hasKey = Boolean(process.env[provider.keyEnv]);
    for (const model of providerModels(provider)) {
      const id = `${provider.id}/${model}`;
      options.push({
        id: model,
        label: model,
        provider: provider.id,
        usable: hasKey && reachable.has(id),
        ...(hasKey ? {} : { reason: `${provider.keyEnv} is not set on this server` }),
      });
    }
  }

  return jsonOk({
    options,
    autoStartsAt: usable[0] ? `${usable[0].provider.id}/${usable[0].model}` : null,
  } satisfies LokiModelsResponse);
}
