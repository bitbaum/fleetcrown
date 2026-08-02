/**
 * Display formatting for run token/cost figures — client-safe, pure.
 * One place so the run panel, recent-runs list, and any future dashboard
 * print the same shapes ("132k", "1.2M", "~$0.42").
 */

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

/** "~$0.42" / "~$12" — null when there is nothing meaningful to show. */
export function formatCostUsd(costUsd: number | null | undefined): string | null {
  if (costUsd == null || !Number.isFinite(costUsd)) return null;
  if (costUsd >= 10) return `~$${Math.round(costUsd)}`;
  if (costUsd >= 0.005) return `~$${costUsd.toFixed(2)}`;
  return costUsd > 0 ? "<$0.01" : null;
}

/**
 * Compact one-liner for a run: "132k → 8k tok · ~$0.42".
 * Input tokens shown include cache reads (that IS the context the agent
 * consumed); cost is the priced estimate. Null when the run has no usage.
 */
export function formatRunUsage(run: {
  tokensIn: number | null;
  tokensOut: number | null;
  tokensCacheRead?: number | null;
  costUsd: number | null;
}): string | null {
  if (run.tokensIn == null && run.tokensOut == null) return null;
  const input = (run.tokensIn ?? 0) + (run.tokensCacheRead ?? 0);
  const parts = [`${formatTokens(input)} → ${formatTokens(run.tokensOut ?? 0)} tok`];
  const cost = formatCostUsd(run.costUsd);
  if (cost) parts.push(cost);
  return parts.join(" · ");
}
