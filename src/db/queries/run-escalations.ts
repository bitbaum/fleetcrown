import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { runEscalations, type RunEscalation } from "@/db/schema/run-escalations";
import {
  ESCALATION_HUMAN_STREAK,
  levelForStreak,
  renderEscalationBlock,
} from "@/lib/orchestration/escalation-ladder";
import { insertActiveAlertOnce } from "./alerts";
import { selfTelegramTarget, sendTelegramMessage } from "@/lib/actions/telegram-send";
import { logDebug } from "./debug-logs";

/** The open (unresolved) ladder row for one project, if any. */
export async function getOpenEscalation(
  userId: string,
  projectKey: string,
): Promise<RunEscalation | null> {
  const [row] = await db
    .select()
    .from(runEscalations)
    .where(
      and(
        eq(runEscalations.userId, userId),
        eq(runEscalations.projectKey, projectKey),
        isNull(runEscalations.resolvedAt),
      ),
    )
    .orderBy(desc(runEscalations.openedAt))
    .limit(1);
  return row ?? null;
}

/**
 * A failing run closed — advance the project's ladder one rung (or open it at
 * 'retry'). At the 'human' rung, raise the deduped alert + Telegram ping once.
 * Never throws: escalation bookkeeping must not fail a close.
 */
export async function advanceEscalation(input: {
  userId: string;
  projectKey: string;
  runId: string;
  outcome: string;
  error?: string | null;
}): Promise<void> {
  try {
    const open = await getOpenEscalation(input.userId, input.projectKey);
    const failStreak = (open?.failStreak ?? 0) + 1;
    const level = levelForStreak(failStreak);
    if (!level) return;

    if (open) {
      await db
        .update(runEscalations)
        .set({
          failStreak,
          level,
          lastRunId: input.runId,
          lastOutcome: input.outcome,
          lastError: input.error ?? null,
          updatedAt: new Date(),
        })
        .where(eq(runEscalations.id, open.id));
    } else {
      await db.insert(runEscalations).values({
        userId: input.userId,
        projectKey: input.projectKey,
        level,
        failStreak,
        lastRunId: input.runId,
        lastOutcome: input.outcome,
        lastError: input.error ?? null,
      });
    }

    // Top rung = the failure brake's trip point (same constant by
    // construction). The agent can't route around this one — a human can.
    if (failStreak === ESCALATION_HUMAN_STREAK) {
      const created = await insertActiveAlertOnce({
        userId: input.userId,
        type: "run_escalation",
        severity: "urgent",
        title: `${input.projectKey}: ${failStreak} consecutive failed runs`,
        description:
          `The escalation ladder (retry → patch → replan) is exhausted and autopilot is braked. ` +
          `Last failure: ${(input.error ?? input.outcome).slice(0, 300)}`,
        actionUrl: "/control",
        metadata: { projectKey: input.projectKey, runId: input.runId, failStreak },
      });
      if (created) {
        const tg = selfTelegramTarget();
        if (tg) {
          void sendTelegramMessage(
            tg,
            `🚨 ${input.projectKey}: ${failStreak} failed runs in a row — ladder exhausted, autopilot braked. https://fleetcrown.orangecat.ch/control`,
          ).catch(() => {});
        }
      }
    }
  } catch (err) {
    void logDebug({
      source: "run-escalations",
      level: "warn",
      message: "advanceEscalation failed",
      meta: { projectKey: input.projectKey, error: (err as Error).message },
    }).catch(() => {});
  }
}

/** A run succeeded (or the operator intervened) — close the open ladder. */
export async function resolveEscalation(
  userId: string,
  projectKey: string,
  by: "success" | "manual",
): Promise<void> {
  try {
    await db
      .update(runEscalations)
      .set({ resolvedAt: new Date(), resolvedBy: by, updatedAt: new Date() })
      .where(
        and(
          eq(runEscalations.userId, userId),
          eq(runEscalations.projectKey, projectKey),
          isNull(runEscalations.resolvedAt),
        ),
      );
  } catch (err) {
    void logDebug({
      source: "run-escalations",
      level: "warn",
      message: "resolveEscalation failed",
      meta: { projectKey, error: (err as Error).message },
    }).catch(() => {});
  }
}

/**
 * The prompt block for the project's open escalation, or "" — the shape the
 * dispatch assembly paths consume (best-effort, like every context block).
 */
export async function getOpenEscalationBlock(
  userId: string,
  projectKey: string,
): Promise<string> {
  const open = await getOpenEscalation(userId, projectKey);
  if (!open) return "";
  return (
    renderEscalationBlock({
      level: open.level,
      failStreak: open.failStreak,
      lastError: open.lastError,
    }) ?? ""
  );
}
