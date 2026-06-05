// Decision Log feed — unified timeline of "what your fleet did".
//
// Pulls from multiple cloud-side sources (entities + orchestration_runs +
// agent_tokens), merges them by timestamp, and returns a flat reverse-
// chronological list. Built to answer "what did I decide / ship last week?"
// in 30 seconds — the gap surfaced during the 2026-06-04 auto-injection
// thesis as Tier 1.
//
// Sources today:
//   - entities created (type=project) → "Created project X"
//   - orchestration_runs finished → "Ran <intent> on X (outcome)"
//   - agent_tokens minted → "Issued agent token"
//
// Future sources to merge in:
//   - GitHub commits per project (via OAuth token, rate-limit aware)
//   - debug_logs (filtered to auth.* events)
//   - cross-project bus messages (when the bus is live)
//   - memory entries written (would require local agent push)

import { NextRequest, NextResponse } from "next/server";
import { desc, eq, and } from "drizzle-orm";
import { getSessionUserId } from "@/lib/session";
import { db } from "@/db";
import { entities, orchestrationRuns, agentTokens } from "@/db/schema";
import { ENTITY_TYPE } from "@/lib/constants/statuses";

export type DecisionEventKind = "project_created" | "agent_run" | "token_minted";

export interface DecisionEvent {
  id: string;
  timestamp: string; // ISO
  kind: DecisionEventKind;
  /** Project name where applicable; null for cross-cutting events. */
  project: string | null;
  summary: string;
  detail?: string;
}

export interface DecisionFeedResponse {
  events: DecisionEvent[];
  generatedAt: string;
  truncatedAt?: number;
}

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = Math.min(
    parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10) || 50,
    200,
  );

  // Fetch each source independently in parallel; merge after.
  const [projects, runs, tokens] = await Promise.all([
    db
      .select({
        id: entities.id,
        name: entities.name,
        createdAt: entities.createdAt,
        gitUrl: entities.gitUrl,
        description: entities.description,
      })
      .from(entities)
      .where(and(eq(entities.userId, userId), eq(entities.type, ENTITY_TYPE.PROJECT)))
      .orderBy(desc(entities.createdAt))
      .limit(limit),

    db
      .select({
        id: orchestrationRuns.id,
        projectKey: orchestrationRuns.projectKey,
        adapter: orchestrationRuns.adapter,
        intent: orchestrationRuns.intent,
        state: orchestrationRuns.state,
        outcome: orchestrationRuns.outcome,
        startedAt: orchestrationRuns.startedAt,
        finishedAt: orchestrationRuns.finishedAt,
      })
      .from(orchestrationRuns)
      .where(eq(orchestrationRuns.userId, userId))
      .orderBy(desc(orchestrationRuns.startedAt))
      .limit(limit),

    db
      .select({
        id: agentTokens.id,
        label: agentTokens.label,
        createdAt: agentTokens.createdAt,
      })
      .from(agentTokens)
      .where(eq(agentTokens.userId, userId))
      .orderBy(desc(agentTokens.createdAt))
      .limit(limit),
  ]);

  const events: DecisionEvent[] = [];

  for (const p of projects) {
    events.push({
      id: `proj-${p.id}`,
      timestamp: p.createdAt.toISOString(),
      kind: "project_created",
      project: p.name,
      summary: `Created project ${p.name}`,
      detail: p.gitUrl ?? p.description ?? undefined,
    });
  }

  for (const r of runs) {
    const ended = r.finishedAt ?? r.startedAt;
    const outcomeLabel = r.outcome ?? r.state;
    events.push({
      id: `run-${r.id}`,
      timestamp: ended.toISOString(),
      kind: "agent_run",
      project: r.projectKey,
      summary: `${r.adapter} · ${r.intent} on ${r.projectKey}`,
      detail: outcomeLabel,
    });
  }

  for (const t of tokens) {
    events.push({
      id: `tok-${t.id}`,
      timestamp: t.createdAt.toISOString(),
      kind: "token_minted",
      project: null,
      summary: `Issued agent token${t.label ? ` "${t.label}"` : ""}`,
    });
  }

  // Merge-sort: reverse chrono, cap to `limit`.
  events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const truncated = events.length > limit;
  const trimmed = events.slice(0, limit);

  return NextResponse.json({
    events: trimmed,
    generatedAt: new Date().toISOString(),
    ...(truncated ? { truncatedAt: limit } : {}),
  } satisfies DecisionFeedResponse);
}
