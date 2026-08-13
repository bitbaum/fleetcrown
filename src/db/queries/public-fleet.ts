// Real data for the public landing hero — replaces the fabricated HOME_HERO_CONSOLE.
//
// The landing is unauthenticated, so this serves the OWNER's real fleet (founder
// dogfooding). Everything here is PUBLIC-SAFE: aggregate counts + public project
// names + their one-line descriptions + a coarse running/idle status dot. No
// internal dev-log notes, no task text. Honest by construction — `isLive` is true
// only when an agent is actually running, so the hero never claims "LIVE" falsely.

import { countActiveProjects, getPublicProjects } from "./user-projects";
import { getFleetSummary, getRecentOrchestrationRuns } from "./today";
import { getProjectStatesByUserId } from "./project-states";
import { isPublicTestArtifact, publicHeroNote } from "@/lib/project-display";

export type HeroFleetRow = { name: string; state: "running" | "queued" | "idle"; note: string };
export type HeroFleetSnapshot = {
  isLive: boolean;
  projects: HeroFleetRow[];
  metrics: { value: string; label: string }[];
};

const HERO_PROJECT_ROWS = 4;

/** Compose a public-safe, real snapshot of the owner's fleet for the landing hero. */
export async function getHeroFleetSnapshot(userId: string): Promise<HeroFleetSnapshot> {
  const [projectCount, fleet, publicProjects, states, weekRuns] = await Promise.all([
    countActiveProjects(userId),
    getFleetSummary(userId),
    getPublicProjects(userId),
    getProjectStatesByUserId(userId),
    getRecentOrchestrationRuns(userId, 168).catch(() => [] as unknown[]),
  ]);

  // Match coarse status by canonical project key (project_states.projectKey ~ name).
  const runningByKey = new Map(states.map((s) => [s.projectKey.toLowerCase(), s.agentRunning]));

  // Feature flagships first, then fill — so the rows lead with what matters.
  const FLAGSHIPS = ["fleetcrown", "orangecat"];
  const ordered = [...publicProjects].sort((a, b) => {
    const ai = FLAGSHIPS.indexOf(a.name.toLowerCase());
    const bi = FLAGSHIPS.indexOf(b.name.toLowerCase());
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const projects: HeroFleetRow[] = ordered
    .filter((p) => !isPublicTestArtifact(p.name))
    .slice(0, HERO_PROJECT_ROWS)
    .map((p) => ({
      name: p.name,
      state: runningByKey.get(p.name.toLowerCase()) ? "running" : "idle",
      note: publicHeroNote(p.description) ?? "",
    }));

  return {
    isLive: fleet.running > 0,
    projects,
    metrics: [
      { value: String(projectCount), label: projectCount === 1 ? "project" : "projects" },
      { value: String(fleet.running), label: fleet.running === 1 ? "agent running" : "agents running" },
      { value: String(weekRuns.length), label: "runs this week" },
    ],
  };
}

// ---------------------------------------------------------------------------
// "Shipped thanks to feedback" — the reverse rail of the feedback widget.
// Same doctrine as the hero snapshot: real data, public-safe by construction.
// Raw visitor text NEVER auto-publishes — only rows the operator explicitly
// featured (featured_at, resolved rows only) surface here, excerpted; the
// aggregate counts carry the story even before anything is featured.
// ---------------------------------------------------------------------------

import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { entities, siteFeedback } from "@/db/schema";
import { getFeedbackLoopMetrics } from "./site-feedback";
import { FEEDBACK_STATUS } from "@/lib/constants/statuses";

export type ShippedFeedbackEntry = {
  excerpt: string;
  page: string | null;
  project: string;
  resolvedAt: string;
};
export type ShippedFeedbackSnapshot = {
  resolvedCount: number;
  medianResolutionHours: number | null;
  entries: ShippedFeedbackEntry[];
};

const STRIP_MAX_ENTRIES = 3;
const EXCERPT_LEN = 140;

export async function getShippedFromFeedbackSnapshot(userId: string): Promise<ShippedFeedbackSnapshot> {
  const [loop, rows] = await Promise.all([
    getFeedbackLoopMetrics(userId),
    db
      .select({
        suggestion: siteFeedback.suggestion,
        page: siteFeedback.page,
        project: entities.name,
        resolvedAt: siteFeedback.resolvedAt,
      })
      .from(siteFeedback)
      .innerJoin(entities, eq(siteFeedback.projectId, entities.id))
      .where(and(
        eq(siteFeedback.userId, userId),
        eq(siteFeedback.status, FEEDBACK_STATUS.RESOLVED),
        isNotNull(siteFeedback.featuredAt),
      ))
      .orderBy(desc(sql`${siteFeedback.featuredAt}`))
      .limit(STRIP_MAX_ENTRIES),
  ]);

  return {
    resolvedCount: loop.resolved,
    medianResolutionHours: loop.medianResolutionHours,
    entries: rows.map((r) => ({
      excerpt: r.suggestion.length > EXCERPT_LEN ? `${r.suggestion.slice(0, EXCERPT_LEN)}…` : r.suggestion,
      page: r.page,
      project: r.project,
      resolvedAt: (r.resolvedAt ?? new Date()).toISOString(),
    })),
  };
}
