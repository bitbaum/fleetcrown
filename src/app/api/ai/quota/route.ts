import { jsonOk, jsonError } from "@/lib/api/route-helpers";
import { getSessionUserId } from "@/lib/session";
import { listQuota } from "@/db/queries/provider-quota";
import { usableChatChain } from "@/config/chat-models";
import { describeQuota, unknownQuota, summarise, type QuotaRowView } from "@/lib/ai/quota-view";

/**
 * What is left at each AI vendor, as something the operator can act on.
 *
 * Reads observations recorded from rate-limit headers on calls the app was
 * already making — never by polling a vendor's usage endpoint, which was
 * measured reporting an untouched allowance while the key was locked out of
 * free models.
 *
 * The chain is walked as well as the table, because a provider with a key but
 * no reading has to appear as UNKNOWN. Listing only what has been measured
 * would let the page read as the whole fleet while silently omitting the vendor
 * about to serve the next turn.
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const now = Date.now();
  const [rows, chain] = await Promise.all([
    listQuota().catch(() => []),
    Promise.resolve(usableChatChain()),
  ]);

  // Chain order is fallback order, so "what serves this next" is simply the
  // following link — that is the consequence half of every row.
  const nextAfter = (provider: string): string | null => {
    const idx = chain.findIndex((l) => l.provider.id === provider);
    if (idx === -1) return null;
    for (let i = idx + 1; i < chain.length; i++) {
      const next = chain[i];
      if (next && next.provider.id !== provider) return next.provider.id;
    }
    return null;
  };

  const measured: QuotaRowView[] = rows.map((r) =>
    describeQuota(
      {
        provider: r.provider,
        model: r.model,
        scope: r.scope,
        window: r.windowKind,
        quotaLimit: r.quotaLimit,
        remaining: r.remaining,
        resetAt: r.resetAt,
        observedAt: r.observedAt,
      },
      { now, nextProvider: nextAfter(r.provider) },
    ),
  );

  // Every configured vendor we have heard nothing from. Stated, not omitted.
  const heardFrom = new Set(rows.map((r) => r.provider));
  const silent: QuotaRowView[] = [];
  for (const link of chain) {
    if (heardFrom.has(link.provider.id)) continue;
    if (silent.some((s) => s.provider === link.provider.id)) continue;
    silent.push(unknownQuota(link.provider.id, "configured, but it has not served an answer yet"));
  }

  const providers = [...measured, ...silent];
  return jsonOk({
    summary: summarise(providers),
    providers,
    // So the page can say WHY a vendor is absent from the chain entirely.
    configured: chain.map((l) => ({ provider: l.provider.id, model: l.model })),
  });
}
