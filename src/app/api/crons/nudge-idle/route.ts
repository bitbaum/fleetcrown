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
import { and, eq, gt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { entities, beaconSettings, orchestrationRuns, pendingCommands } from "@/db/schema";
import { logDebug } from "@/db/queries/debug-logs";
import { requireCronAuth } from "@/lib/cron-auth";
import { PROMPT_TEMPLATES } from "@/config/prompt-library";
import { getProjectContext } from "@/db/queries/project-context";
import { renderProjectContextBlock } from "@/lib/orchestration";
import { ENTITY_TYPE } from "@/lib/constants/statuses";

// Module-load: resolve the next-best template once. Throw on import if it's
// missing — this cron is unattended; silent no-op would be worse than a
// loud build failure.
const NEXT_BEST_TEMPLATE = PROMPT_TEMPLATES.find((p) => p.id === "next-best-step");
if (!NEXT_BEST_TEMPLATE) {
  throw new Error("nudge-idle cron: PROMPT_TEMPLATES is missing 'next-best-step'");
}
// Narrow once for the rest of the file — TS doesn't follow the throw across
// the module boundary into request handlers.
const TEMPLATE = NEXT_BEST_TEMPLATE;

const IDLE_WINDOW_HOURS = 2;
const RENUDGE_COOLDOWN_HOURS = 6;
const MAX_NUDGES_PER_TICK = 25; // cap so a runaway misconfig can't fan out

interface Skips {
  paused_per_project: number;
  recent_activity: number;
  has_pending_command: number;
  recent_nudge: number;
}

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const skipped: Skips = {
    paused_per_project: 0,
    recent_activity: 0,
    has_pending_command: 0,
    recent_nudge: 0,
  };
  const nudgedRows: Array<{ userId: string; projectId: string; projectName: string }> = [];

  try {
    // 1. Users with fleet autopilot enabled (any non-off mode, incl. legacy rows).
    const activeUsers = await db
      .select({ userId: beaconSettings.userId })
      .from(beaconSettings)
      .where(ne(beaconSettings.autoInjectMode, "off"));

    if (activeUsers.length === 0) {
      return NextResponse.json({
        ok: true,
        checkedUsers: 0,
        nudged: 0,
        skipped,
        note: "no users with fleet autopilot on — scheduler idle by design",
      });
    }

    const idleCutoff = new Date(Date.now() - IDLE_WINDOW_HOURS * 3_600_000);
    const cooldownMs = RENUDGE_COOLDOWN_HOURS * 3_600_000;
    const now = Date.now();

    for (const { userId } of activeUsers) {
      if (nudgedRows.length >= MAX_NUDGES_PER_TICK) break;

      const projects = await db
        .select({
          id: entities.id,
          name: entities.name,
          autoInjectModeOverride: entities.autoInjectModeOverride,
          metadata: entities.metadata,
        })
        .from(entities)
        .where(and(eq(entities.userId, userId), eq(entities.type, ENTITY_TYPE.PROJECT)));

      for (const proj of projects) {
        if (nudgedRows.length >= MAX_NUDGES_PER_TICK) break;

        // (a) Per-project pause.
        if (proj.autoInjectModeOverride === "off") {
          skipped.paused_per_project++;
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

        // Eligible — queue the nudge. Prepend the project's roadmap (brief +
        // active goals) so the autonomous nudge aims at the goals, same as the
        // dispatch path (renderTaskForAdapter). Same SSOT block, same source.
        const contextBlock = renderProjectContextBlock(
          (await getProjectContext(userId, proj.name)) ?? undefined,
        );
        const renderedPrompt = [
          contextBlock,
          TEMPLATE.template.replace(/\{\{project_name\}\}/g, proj.name),
        ].filter(Boolean).join("\n\n");
        await db.insert(pendingCommands).values({
          userId,
          type: "inject",
          payload: {
            tab: proj.name,
            prompt: renderedPrompt,
            promptKey: "next-best-step",
            promptLabel: "Next Best Step (autonomous)",
            projectId: proj.id,
            projectKey: proj.name,
          },
        });

        const nextMetadata = { ...(proj.metadata ?? {}), lastNudgedAt: new Date().toISOString() };
        await db
          .update(entities)
          .set({ metadata: nextMetadata, updatedAt: new Date() })
          .where(eq(entities.id, proj.id));

        nudgedRows.push({ userId, projectId: proj.id, projectName: proj.name });
      }
    }

    logDebug({
      source: "api/crons/nudge-idle",
      level: "info",
      message: `Nudged ${nudgedRows.length} idle project(s) across ${activeUsers.length} autopilot-on user(s)`,
      meta: { nudged: nudgedRows, skipped, capped: nudgedRows.length >= MAX_NUDGES_PER_TICK },
    });

    return NextResponse.json({
      ok: true,
      checkedUsers: activeUsers.length,
      nudged: nudgedRows.length,
      skipped,
      details: nudgedRows,
    });
  } catch (e) {
    const msg = (e as Error).message;
    logDebug({
      source: "api/crons/nudge-idle",
      level: "error",
      message: `Cron failed: ${msg}`,
      meta: { partialNudged: nudgedRows.length, skipped },
    });
    return NextResponse.json({ ok: false, error: msg, partialNudged: nudgedRows.length }, { status: 500 });
  }
}
