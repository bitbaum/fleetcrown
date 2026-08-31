/**
 * Proactive check-in producer — the DB-touching half of the "keep relationships
 * warm" loop. Scans a user's cold contacts and enqueues draft "Reach out to X"
 * commitments for the operator to approve.
 *
 * Kept separate from checkin-proposal.ts (which stays DB-free so its selection +
 * shaping core is unit-testable). Best-effort and fully bounded: a queue-pressure
 * cap, a per-contact cooldown, and a small per-tick limit keep it from ever
 * flooding the queue. IRON RULE holds — everything it writes is status='draft'.
 */
import { searchPeople } from "@/db/queries/people";
import { SORT_MODE } from "@/lib/constants/statuses";
import {
  proposeAction,
  countPendingCheckins,
  getEntityIdsWithRecentCheckin,
} from "@/db/queries/actions";
import { recordActionAuditEvent } from "@/db/queries/control-audit-events";
import {
  buildCheckinProposal,
  selectCheckinCandidates,
  type CheckinCandidate,
} from "@/lib/actions/checkin-proposal";
import type { QueuedActionSummary } from "@/lib/actions/enqueue-proposal";

const CANDIDATE_POOL = 40; // how many cold contacts to consider per tick
const MAX_PER_TICK = 3; // never queue more than a handful of new nudges at once
const MAX_PENDING_CHECKINS = 6; // if this many are already un-actioned, add none
const COOLDOWN_DAYS = 30; // don't re-propose the same contact within a month

export type CheckinRunResult = {
  proposed: QueuedActionSummary[];
  scanned: number;
  skipped: "queue_full" | null;
};

/**
 * Propose check-ins for one user. `nowMs` anchors due-date math (the caller
 * passes the clock so this stays deterministically driveable). Returns a summary
 * of what was queued.
 */
export async function proposeCheckins(userId: string, nowMs: number): Promise<CheckinRunResult> {
  // Queue-pressure guard: a stack of un-actioned check-ins means the operator
  // isn't clearing them — adding more is noise, not help.
  if ((await countPendingCheckins(userId)) >= MAX_PENDING_CHECKINS) {
    return { proposed: [], scanned: 0, skipped: "queue_full" };
  }

  // Oldest-contacted first, only relationships that have gone cold (fading+stale
  // = >14 days since the last interaction). "unknown" (never contacted) is
  // excluded by the health filter — you can't re-check-in with someone you've
  // never actually spoken to, and the imported address book is mostly those.
  const { people } = await searchPeople(userId, "", CANDIDATE_POOL, 0, SORT_MODE.HEALTH, [
    "fading",
    "stale",
  ]);
  const contacts: CheckinCandidate[] = people.map((p) => ({
    id: p.id,
    name: p.name,
    lastInteraction: p.lastInteraction,
  }));

  const recentlyProposedIds = await getEntityIdsWithRecentCheckin(userId, COOLDOWN_DAYS);
  const selected = selectCheckinCandidates(contacts, {
    recentlyProposedIds,
    maxPerTick: MAX_PER_TICK,
  });

  const proposed: QueuedActionSummary[] = [];
  for (const contact of selected) {
    const action = await proposeAction(userId, buildCheckinProposal(contact, nowMs));
    if (!action) continue; // deduped against an already-pending draft
    await recordActionAuditEvent(userId, action, "proposed");
    proposed.push({ id: action.id, type: action.type, title: action.title });
  }

  return { proposed, scanned: contacts.length, skipped: null };
}
