import { createInteraction } from "@/db/queries/people";
import { recordActionAuditEvent } from "@/db/queries/control-audit-events";
import { executeAction, type ExecuteActionResult } from "@/lib/actions/execute-action";
import type { ActionRow } from "@/db/queries/actions";
import { ACTION_TYPE, type ActionType, INTERACTION_DIRECTION } from "@/lib/constants/statuses";

const INTERACTION_ACTION_TYPES = new Set<ActionType>([
  ACTION_TYPE.SEND_MESSAGE,
  ACTION_TYPE.SEND_EMAIL,
  ACTION_TYPE.FOLLOW_UP,
]);

/**
 * Shared post-approval path: log the outbound interaction (for message types),
 * audit the approval, then run the executor. The executor is fail-closed — it
 * only advances the row to 'executed' on a real successful effect; external
 * types are deferred and audited (see lib/actions/execute-action.ts).
 *
 * SSOT for both approval surfaces: the Approvals page server action
 * (src/app/actions.ts) and the agent HTTP route (/api/actions/[id]/decision),
 * so approve-from-chat and approve-from-UI cannot drift apart.
 */
export async function finalizeApproved(userId: string, action: ActionRow): Promise<ExecuteActionResult> {
  if (action.entityId && INTERACTION_ACTION_TYPES.has(action.type)) {
    await createInteraction(userId, {
      entityId: action.entityId,
      channel: String(action.payload?.channel ?? "other"),
      direction: INTERACTION_DIRECTION.OUTBOUND,
      summary: action.title,
    });
  }
  await recordActionAuditEvent(userId, action, "approved");
  return executeAction(userId, action);
}
