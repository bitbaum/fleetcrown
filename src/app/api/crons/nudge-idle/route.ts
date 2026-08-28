// Cron target — nudges idle projects whose owners want autonomous next_best
// dispatch. The "tool → system" lever the v0.6 essay called for: when the
// user walks away, the system keeps moving on the projects they've trusted
// to keep moving.
//
// v1 scope (deliberately narrow):
//   - Only fires for users with fleet autopilot ON (auto_inject_mode != 'off').
//     Legacy stored values (next_best, beacon, …) count as on via the same rule
//     the rest of the app uses after the 2026-06-11 collapse.
//   - Respects per-project auto_inject_mode_override (the toggle shipped
//     2026-06-05). A project paused via the ProjectCard switch is never nudged.
//   - Conservative thresholds:
//       * Project must have NO orchestration_runs started in the last 2 hours
//       * No pending_commands with executed_at IS NULL (don't pile on)
//       * entities.metadata.lastNudgedAt must be NULL or > 6 hours ago
//   - One-shot: each cron tick fires at most one nudge per eligible project,
//     capped at MAX_NUDGES_PER_TICK total.
//
// Schedule: daily at 04:00 UTC (system crontab on the box, see
// scripts/install-hetzner-crons.sh). To run more often, drop the schedule
// to */30 * * * * for tighter idle-nudge cadence.

import { type NextRequest, NextResponse } from "next/server";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { entities, orchestrationRuns, pendingCommands } from "@/db/schema";
import { logDebug } from "@/db/queries/debug-logs";
import { requireCronAuth } from "@/lib/cron-auth";
import { ENTITY_TYPE } from "@/lib/constants/statuses";
import { MAX_CONCURRENT_BUILDING } from "@/lib/constants/control";
import { getFleetAutopilotUserIds } from "@/db/queries/beacon-settings";
import { getUserProjects } from "@/db/queries/user-projects";
import { getRecentOutcomes } from "@/db/queries/orchestration-runs";
import { getProjectState } from "@/db/queries/project-states";
import { getBeaconSettings } from "@/db/queries/beacon-settings";
import { DEFAULT_AUTO_INJECT_MODE } from "@/lib/constants/control";
import type { AutoInjectMode } from "@/config/beacon";
import { evaluateScheduledDispatch } from "@/lib/orchestration/autopilot-eligibility";
import { injectPrompt } from "@/lib/inject-core";
import { HOUR_MS } from "@/lib/constants/time";

const IDLE_WINDOW_HOURS = 2;
const RENUDGE_COOLDOWN_HOURS = 6;
// Same cold-start throttle as fleet-kick (MAX_CONCURRENT_BUILDING): each tick
// wakes at most 3 projects, and the idle/cooldown gates spread the rest over
// later ticks. The old cap (25) predates the scheduler actually firing — it
// was written while the user-selection bug made this cron a silent no-op; the
// first real tick after that fix would have cold-started ~18 agent PTYs at
// once on a 4 GB box.
const MAX_NUDGES_PER_TICK = MAX_CONCURRENT_BUILDING;

interface Skips {
  paused_per_project: number;
  no_path: number;
  recent_activity: number;
  has_pending_command: number;
  recent_nudge: number;
  /** Refused by the SSOT dispatch gates (agent working/blocked, no-op fuse,
   *  failure brake, autopilot off) — see autopilot-eligibility. */
  gated: number;
  inject_failed: number;
}

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const skipped: Skips = {
    paused_per_project: 0,
    no_path: 0,
    recent_activity: 0,
    has_pending_command: 0,
    recent_nudge: 0,
    gated: 0,
    inject_failed: 0,
  };
  const nudgedRows: Array<{ userId: string; projectId: string; projectName: string }> = [];
  /** Why each gated project was refused — surfaced in the tick log so a silent
   *  fleet is always explainable without re-deriving the decision by hand. */
  const gatedRows: Array<{ projectName: string; source: string; reason: string }> = [];

  try {
    // 1. Users with fleet autopilot enabled — via the SSOT helper, which counts
    // users with NO beacon row as on (missing row = DEFAULT_AUTO_INJECT_MODE).
    // A raw `WHERE mode != 'off'` here once made default-mode users invisible
    // to the scheduler: the hero said "Autopilot on" while the cron saw zero
    // enrolled users and the fleet silently stopped (2026-07-02).
    const activeUsers = (await getFleetAutopilotUserIds()).map((userId) => ({ userId }));

    if (activeUsers.length === 0) {
      logDebug({
        source: "crons/nudge-idle",
        level: "info",
        message: "Tick: no autopilot-on users with active projects — scheduler idle",
        meta: { skipped },
      });
      return NextResponse.json({
        ok: true,
        checkedUsers: 0,
        nudged: 0,
        skipped,
        note: "no users with fleet autopilot on — scheduler idle by design",
      });
    }

    const idleCutoff = new Date(Date.now() - IDLE_WINDOW_HOURS * HOUR_MS);
    const cooldownMs = RENUDGE_COOLDOWN_HOURS * HOUR_MS;
    const now = Date.now();

    for (const { userId } of activeUsers) {
      if (nudgedRows.length >= MAX_NUDGES_PER_TICK) break;

      const settings = await getBeaconSettings(userId).catch(() => null);
      const userMode = (settings?.auto_inject_mode ?? DEFAULT_AUTO_INJECT_MODE) as AutoInjectMode;

      const [projects, executableProjects] = await Promise.all([
        db
        .select({
          id: entities.id,
          name: entities.name,
          autoInjectModeOverride: entities.autoInjectModeOverride,
          metadata: entities.metadata,
        })
        .from(entities)
        .where(and(eq(entities.userId, userId), eq(entities.type, ENTITY_TYPE.PROJECT))),
        getUserProjects(userId).catch(() => []),
      ]);
      const executableByName = new Map(executableProjects.map((project) => [project.name.toLowerCase(), project]));

      for (const proj of projects) {
        if (nudgedRows.length >= MAX_NUDGES_PER_TICK) break;

        // (a) Per-project pause. Kept as its own counter because "the human
        // switched this project off" is a different story from "the agent said
        // it isn't available"; the SSOT gates below would also refuse it.
        if (proj.autoInjectModeOverride === "off") {
          skipped.paused_per_project++;
          continue;
        }

        if (!executableByName.get(proj.name.toLowerCase())?.dirPath) {
          skipped.no_path++;
          continue;
        }

        // (b) Recent-nudge cooldown via entity metadata.
        const lastNudgedAtRaw = (proj.metadata as { lastNudgedAt?: string } | null)?.lastNudgedAt;
        if (lastNudgedAtRaw) {
          const last = new Date(lastNudgedAtRaw).getTime();
          if (!isNaN(last) && now - last < cooldownMs) {
            skipped.recent_nudge++;
            continue;
          }
        }

        // (c) Recent orchestration activity for this project.
        const recentRun = await db
          .select({ id: orchestrationRuns.id })
          .from(orchestrationRuns)
          .where(
            and(
              eq(orchestrationRuns.userId, userId),
              eq(orchestrationRuns.projectKey, proj.name),
              gt(orchestrationRuns.startedAt, idleCutoff),
            ),
          )
          .limit(1);
        if (recentRun.length > 0) {
          skipped.recent_activity++;
          continue;
        }

        // (d) Open pending command — don't pile on.
        const openCommand = await db
          .select({ id: pendingCommands.id })
          .from(pendingCommands)
          .where(
            and(
              eq(pendingCommands.userId, userId),
              sql`${pendingCommands.executedAt} IS NULL`,
              sql`${pendingCommands.payload}->>'projectKey' = ${proj.name}`,
            ),
          )
          .limit(1);
        if (openCommand.length > 0) {
          skipped.has_pending_command++;
          continue;
        }

        // (e) The SSOT safety gates — the SAME ones /api/control/dispatch
        // enforces, applied to persisted state (see autopilot-eligibility).
        // Until 2026-08-02 this cron hand-rolled only the failure brake, so it
        // woke agents that had reported `status: working|blocked` and agents
        // stuck in a no-op loop. Such a nudge cannot succeed: the agent
        // correctly declines to act, writes no fresh handoff, and the run is
        // reaped an hour later as partial/timeout. Refusing to dispatch is what
        // turns those guaranteed failures into no run at all.
        const [state, outcomes] = await Promise.all([
          getProjectState(userId, proj.name).catch(() => null),
          getRecentOutcomes(userId, proj.name, { limit: 8 }).catch(() => []),
        ]);
        const decision = evaluateScheduledDispatch(state, {
          mode: (proj.autoInjectModeOverride as AutoInjectMode | null) ?? userMode,
          recentOutcomes: outcomes.map((o) => o.outcome),
        });
        if (!decision || decision.action === "off") {
          skipped.gated++;
          gatedRows.push({
            projectName: proj.name,
            source: decision?.source ?? "unknown",
            reason: decision?.reason ?? "no dispatch decision",
          });
          continue;
        }

        // Eligible — dispatch through the same SSOT as Control and Loki. This
        // preserves project context/RAG assembly, run tracking, tenant execution
        // policy, and the runner's self-healing `dispatch` command shape.
        const inject = await injectPrompt({ tab: proj.name, promptKey: "next_best" }, userId);
        if (inject.status >= 400 || inject.body.blocked === true) {
          skipped.inject_failed++;
          continue;
        }

        const nextMetadata = { ...(proj.metadata ?? {}), lastNudgedAt: new Date().toISOString() };
        await db
          .update(entities)
          .set({ metadata: nextMetadata, updatedAt: new Date() })
          .where(eq(entities.id, proj.id));

        nudgedRows.push({ userId, projectId: proj.id, projectName: proj.name });
      }
    }

    logDebug({
      source: "crons/nudge-idle",
      level: "info",
      message: `Nudged ${nudgedRows.length} idle project(s) across ${activeUsers.length} autopilot-on user(s)`,
      meta: { nudged: nudgedRows, skipped, gated: gatedRows, capped: nudgedRows.length >= MAX_NUDGES_PER_TICK },
    });

    return NextResponse.json({
      ok: true,
      checkedUsers: activeUsers.length,
      nudged: nudgedRows.length,
      skipped,
      details: nudgedRows,
      gated: gatedRows,
    });
  } catch (e) {
    const msg = (e as Error).message;
    logDebug({
      source: "crons/nudge-idle",
      level: "error",
      message: `Cron failed: ${msg}`,
      meta: { partialNudged: nudgedRows.length, skipped },
    });
    return NextResponse.json({ ok: false, error: msg, partialNudged: nudgedRows.length }, { status: 500 });
  }
}
