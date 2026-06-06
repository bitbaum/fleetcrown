// Fleet Brief — "what did my fleet do today + this week" summary card on /today.
//
// Tier 1 thesis surface #3 (after Sessions drawer + /decisions). Where
// /decisions is the FULL chronological feed, this is the at-a-glance
// summary built around three rolling windows: today, last 7 days, all-time.
// Renders as a Today-page card so users see fleet health alongside their
// commitments and weather, not buried under another route.
//
// Pure server component: no client interactivity, just SQL aggregation.

import Link from "next/link";
import { and, eq, gte, sql, desc } from "drizzle-orm";
import { Sparkles, Bot, ScrollText, KeyRound, ArrowRight } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { db } from "@/db";
import { entities, orchestrationRuns, agentTokens } from "@/db/schema";
import { ENTITY_TYPE } from "@/lib/constants/statuses";

interface FleetBriefStats {
  projectsToday: number;
  projectsThisWeek: number;
  projectsTotal: number;
  runsToday: number;
  runsThisWeek: number;
  tokensActive: number;
  topProjectsThisWeek: { name: string; runs: number }[];
}

async function loadStats(userId: string): Promise<FleetBriefStats> {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(dayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
  // Drizzle's raw-SQL template interpolation calls .toString() on Date params,
  // which Postgres rejects ("Sat Jun 06 2026 00:00:00 GMT+0000" ≠ valid
  // timestamp literal). Convert to ISO before the FILTER (WHERE ...) clauses
  // so PG gets a parseable timestamp. This crashed /today end-to-end until
  // diagnostics localized it (2026-06-06). The non-template builder helpers
  // (gte/lte/eq) serialize Date correctly; only the raw `sql` interpolation
  // path was broken.
  const dayStartIso = dayStart.toISOString();
  const weekStartIso = weekStart.toISOString();

  const [projectsAgg, runsAgg, topProjects, tokensAgg] = await Promise.all([
    db
      .select({
        today: sql<number>`count(*) filter (where ${entities.createdAt} >= ${dayStartIso}::timestamptz)`,
        thisWeek: sql<number>`count(*) filter (where ${entities.createdAt} >= ${weekStartIso}::timestamptz)`,
        total: sql<number>`count(*)`,
      })
      .from(entities)
      .where(and(eq(entities.userId, userId), eq(entities.type, ENTITY_TYPE.PROJECT))),

    db
      .select({
        today: sql<number>`count(*) filter (where ${orchestrationRuns.startedAt} >= ${dayStartIso}::timestamptz)`,
        thisWeek: sql<number>`count(*) filter (where ${orchestrationRuns.startedAt} >= ${weekStartIso}::timestamptz)`,
      })
      .from(orchestrationRuns)
      .where(eq(orchestrationRuns.userId, userId)),

    db
      .select({
        name: orchestrationRuns.projectKey,
        runs: sql<number>`count(*)::int`,
      })
      .from(orchestrationRuns)
      .where(and(eq(orchestrationRuns.userId, userId), gte(orchestrationRuns.startedAt, weekStart)))
      .groupBy(orchestrationRuns.projectKey)
      .orderBy(desc(sql`count(*)`))
      .limit(3),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(agentTokens)
      .where(eq(agentTokens.userId, userId)),
  ]);

  return {
    projectsToday:    Number(projectsAgg[0]?.today ?? 0),
    projectsThisWeek: Number(projectsAgg[0]?.thisWeek ?? 0),
    projectsTotal:    Number(projectsAgg[0]?.total ?? 0),
    runsToday:        Number(runsAgg[0]?.today ?? 0),
    runsThisWeek:     Number(runsAgg[0]?.thisWeek ?? 0),
    tokensActive:     Number(tokensAgg[0]?.count ?? 0),
    topProjectsThisWeek: topProjects.map((p) => ({ name: p.name, runs: Number(p.runs) })),
  };
}

export async function FleetBriefCard({ userId }: { userId: string }) {
  const stats = await loadStats(userId);
  const totalEvents = stats.projectsToday + stats.runsToday;

  return (
    <Card>
      <CardHeader
        icon={ScrollText}
        title="Fleet brief"
        right={
          <Link
            href="/decisions"
            className="text-xs text-text-tertiary hover:text-text-secondary inline-flex items-center gap-0.5"
          >
            See timeline
            <ArrowRight className="h-3 w-3" />
          </Link>
        }
      />
      <div className="space-y-4 p-4 pt-2">
        {totalEvents === 0 ? (
          <p className="text-sm text-text-muted">
            Nothing happened on your fleet today. {stats.projectsTotal === 0
              ? <>Start with <Link href="/control/new-from-scratch" className="text-accent underline">your first project →</Link></>
              : <>Open <Link href="/control" className="text-accent underline">Control</Link> to dispatch an agent.</>
            }
          </p>
        ) : (
          <>
            <p className="text-sm text-text-secondary">
              Today: {summarizeToday(stats)}
            </p>
            <p className="text-sm text-text-secondary">
              This week: {summarizeWeek(stats)}
            </p>
          </>
        )}

        {/* Stat tiles — visible always (even when zero). Mirrors the
            Total / Active / This-week pattern from SummaryBar. */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border-subtle">
          <StatTile
            icon={Sparkles}
            label="Projects"
            value={stats.projectsTotal}
            sub={stats.projectsThisWeek > 0 ? `+${stats.projectsThisWeek} this week` : null}
          />
          <StatTile
            icon={Bot}
            label="Runs (week)"
            value={stats.runsThisWeek}
            sub={stats.runsToday > 0 ? `${stats.runsToday} today` : null}
          />
          <StatTile
            icon={KeyRound}
            label="Tokens"
            value={stats.tokensActive}
            sub={null}
          />
        </div>

        {stats.topProjectsThisWeek.length > 0 && (
          <div className="pt-2 border-t border-border-subtle">
            <div className="ui-kicker mb-1">Most active this week</div>
            <ul className="space-y-0.5">
              {stats.topProjectsThisWeek.map((p) => (
                <li key={p.name} className="flex justify-between text-xs">
                  <Link href={`/control?focus=${encodeURIComponent(p.name)}`} className="text-text-primary hover:underline truncate">
                    {p.name}
                  </Link>
                  <span className="text-text-tertiary shrink-0 ml-2">{p.runs} run{p.runs === 1 ? "" : "s"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function summarizeToday(s: FleetBriefStats): string {
  const parts: string[] = [];
  if (s.projectsToday > 0) parts.push(`${s.projectsToday} new project${s.projectsToday === 1 ? "" : "s"}`);
  if (s.runsToday > 0)     parts.push(`${s.runsToday} agent run${s.runsToday === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" · ") : "no activity";
}

function summarizeWeek(s: FleetBriefStats): string {
  const parts: string[] = [];
  if (s.projectsThisWeek > 0) parts.push(`${s.projectsThisWeek} new project${s.projectsThisWeek === 1 ? "" : "s"}`);
  if (s.runsThisWeek > 0)     parts.push(`${s.runsThisWeek} agent run${s.runsThisWeek === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" · ") : "quiet";
}

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Sparkles;
  label: string;
  value: number;
  sub: string | null;
}) {
  return (
    <div className="ui-card-shell p-2.5">
      <div className="flex items-center gap-1 text-text-tertiary">
        <Icon className="h-3 w-3" />
        <span className="ui-micro-label">{label}</span>
      </div>
      <div className="mt-1 text-2xl font-semibold text-text-primary tabular-nums">{value}</div>
      {sub && <div className="text-xs text-text-tertiary mt-0.5">{sub}</div>}
    </div>
  );
}
