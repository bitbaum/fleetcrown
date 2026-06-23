import type { Action } from "@/db/schema/actions";
import { ACTION_TYPE } from "@/lib/constants/statuses";
import { markActionExecuted } from "@/db/queries/actions";
import { createCommitment } from "@/db/queries/today";
import { recordActionAuditEvent } from "@/db/queries/control-audit-events";

export type ExecuteActionResult = {
  /** true only when a real-world effect happened and the row reached status='executed'. */
  executed: boolean;
  /** true when the action type has no executor wired yet (left 'approved', nothing happened). */
  deferred?: boolean;
  /** populated when a wired executor threw (row left 'approved' for retry). */
  error?: string;
};

/** Action types whose executor delegates to OpenClaw's external reach
 *  (gog/Gmail/Calendar/Telegram). Deliberately NOT wired in this slice —
 *  guardrails first: they pass the human gate but fail closed at execution,
 *  so nothing external can fire until that path is built and reviewed. */
const DEFERRED_TYPES = new Set<Action["type"]>([
  ACTION_TYPE.SEND_MESSAGE,
  ACTION_TYPE.SEND_EMAIL,
  ACTION_TYPE.CREATE_EVENT,
  ACTION_TYPE.FOLLOW_UP,
  ACTION_TYPE.OTHER,
]);

/**
 * Perform an APPROVED action's real-world effect, then advance it to 'executed'.
 *
 * Contract (fail-closed): an action only reaches status='executed' on a real,
 * successful effect. Unimplemented types are DEFERRED (left 'approved', audited);
 * a wired executor that throws is caught, audited as 'failed', and left 'approved'
 * for retry. A wrong/duplicate real send is the worst outcome — when in doubt we
 * do NOT act. The caller must have already approved the action (IRON RULE).
 */
export async function executeAction(userId: string, action: Action): Promise<ExecuteActionResult> {
  // External/irreversible types: gate passes, execution intentionally not yet enabled.
  if (DEFERRED_TYPES.has(action.type)) {
    await recordActionAuditEvent(userId, action, "deferred", {
      reason: `executor not yet enabled for type=${action.type}`,
    });
    return { executed: false, deferred: true };
  }

  try {
    switch (action.type) {
      case ACTION_TYPE.CREATE_COMMITMENT: {
        // Internal, reversible: writes to FleetCrown's own commitments table. Zero external risk.
        const payload = action.payload ?? {};
        const description =
          (typeof payload.commitment === "string" && payload.commitment.trim()) || action.title;
        const dueDate = typeof payload.dueDate === "string" ? payload.dueDate : undefined;
        const financialImpact =
          typeof payload.financialImpact === "string" ? payload.financialImpact : undefined;

        await createCommitment(userId, { description, dueDate, financialImpact }, "ivy-action");
        const done = await markActionExecuted(action.id, userId);
        if (!done) {
          // Lost the approved→executed guard (e.g. already executed); commitment was still created.
          await recordActionAuditEvent(userId, action, "failed", {
            reason: "commitment created but action was not in 'approved' state to mark executed",
          });
          return { executed: false, error: "not-approved-at-execute-time" };
        }
        await recordActionAuditEvent(userId, action, "executed");
        return { executed: true };
      }

      default: {
        // Unknown/unhandled type — fail closed rather than silently succeed.
        await recordActionAuditEvent(userId, action, "deferred", {
          reason: `no executor for type=${action.type}`,
        });
        return { executed: false, deferred: true };
      }
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await recordActionAuditEvent(userId, action, "failed", { reason: error });
    return { executed: false, error };
  }
}
