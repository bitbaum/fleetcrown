/**
 * Shared producer step: message → extracted proposal → queued draft action.
 *
 * Kept separate from extract-proposal.ts (which stays DB-free so its parse/validate
 * core is unit-testable) because this touches the DB. Both chat surfaces — the
 * quick-ask /api/loki route and the main /api/conversations/[id]/messages route —
 * call this so the queue's producer lives in exactly one place.
 *
 * Fully best-effort: extraction or the queue write failing just means "nothing
 * queued this turn" — it must never break the chat reply. IRON RULE holds: this
 * only ever inserts status='draft'; the operator approves before anything runs.
 */
import type { ActionType } from "@/lib/constants/statuses";
import { ACTION_TYPE } from "@/lib/constants/statuses";
import { extractActionProposal } from "@/lib/actions/extract-proposal";
import { proposeAction } from "@/db/queries/actions";
import { recordActionAuditEvent } from "@/db/queries/control-audit-events";
import { enrichReachPayload, reachFromPerson, resolvePersonToReach } from "@/lib/people-resolve";

export type QueuedActionSummary = { id: string; type: ActionType; title: string };

/**
 * Detect an actionable request in `rawMessage`, enqueue it as a draft, and return
 * a summary for the UI. Returns null when there's nothing to queue OR when the
 * draft dedupes against an already-pending one (so the UI never claims a
 * duplicate add). `nowISO` anchors relative dates — the caller passes the clock.
 */
export async function enqueueProposalFromMessage(
  userId: string,
  rawMessage: string,
  nowISO: string,
): Promise<QueuedActionSummary | null> {
  const proposal = await extractActionProposal(rawMessage, nowISO).catch(() => null);
  if (!proposal) return null;

  const hint = typeof proposal.payload?.to === "string" ? proposal.payload.to : undefined;
  const person =
    proposal.type === ACTION_TYPE.SEND_MESSAGE || proposal.type === ACTION_TYPE.SEND_EMAIL
      ? await resolvePersonToReach(userId, hint, rawMessage).catch(() => null)
      : null;
  const reach = person ? reachFromPerson(person) : null;

  const action = await proposeAction(userId, {
    type: proposal.type,
    title:
      person &&
      (proposal.type === ACTION_TYPE.SEND_MESSAGE || proposal.type === ACTION_TYPE.SEND_EMAIL)
        ? `Message ${person.name}`.slice(0, 200)
        : proposal.title,
    description: proposal.description,
    payload: enrichReachPayload(proposal.payload, reach),
    reasoning: person
      ? `Matched ${person.name}${reach ? ` on ${reach.channel}` : ""}.`
      : (proposal.reasoning ?? "Proposed by Loki from chat — approve to run it."),
    entityId: person?.id ?? null,
  });
  // proposeAction dedupes an already-pending draft title to null.
  if (!action) return null;

  await recordActionAuditEvent(userId, action, "proposed");
  return { id: action.id, type: action.type, title: action.title };
}
