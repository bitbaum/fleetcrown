/**
 * Pure run→wall moment builder — no db/network imports so the unit suite
 * (scripts/test-unit.ts, DB-free by construction) can exercise it directly.
 * Consumed by orangecat-publish.promoteRunClose.
 */

/** The slice of an orchestration run the promote step needs — kept structural
 *  (not the drizzle row type) so the builder is trivially testable. */
export interface RunPromoteInput {
  id: string;
  userId: string;
  projectKey: string;
  intent: string;
  adapter: string;
  summary?: { done?: string; next?: string; commit?: string; health?: string } | null;
  payload?: { durationMs?: number } | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  costUsd?: number | null;
}

export interface RunMoment {
  /** Deterministic (= run id): fire-and-forget emit, retries, and the backfill
   *  janitor all reconcile onto the same OC wall row. */
  externalId: string;
  title: string;
  description?: string;
  content?: Record<string, unknown>;
}

/**
 * Build the OC wall moment for a successfully closed run. The token/cost
 * figures from the run ledger ride along in `content`: the wall shows not
 * just that agent work happened, but what it consumed — the public face of
 * the cost-accounting loop.
 */
export function buildRunMoment(projectName: string, run: RunPromoteInput): RunMoment {
  const done = run.summary?.done?.trim();
  const next = run.summary?.next?.trim();
  return {
    externalId: `fleetcrown_run_${run.id}`,
    title: `${projectName}: ${firstLine(done) || "agent run completed"}`,
    description: [done, next ? `Next: ${next}` : null].filter(Boolean).join("\n\n") || undefined,
    content: {
      kind: "orchestration_run",
      intent: run.intent,
      adapter: run.adapter,
      ...(run.summary?.commit && run.summary.commit.toLowerCase() !== "none"
        ? { commit: run.summary.commit }
        : {}),
      ...(run.payload?.durationMs != null ? { durationMs: run.payload.durationMs } : {}),
      ...(run.tokensIn != null ? { tokensIn: run.tokensIn } : {}),
      ...(run.tokensOut != null ? { tokensOut: run.tokensOut } : {}),
      ...(run.costUsd != null ? { costUsd: run.costUsd } : {}),
    },
  };
}

function firstLine(s: string | undefined): string {
  return (s ?? "").split("\n")[0].trim().slice(0, 160);
}
