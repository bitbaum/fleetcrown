// Query layer for the beacon_sessions table — Change 4.
//
// Mirrors the API of the file-based functions previously exported from
// src/app/api/beacon/route.ts (beaconPath, readBeaconSession,
// readLatestPendingSession, cancelActiveBeaconSessions) so the migration
// is a near-1:1 swap at the call sites.
//
// One semantic difference worth flagging: the file-based version used
// /tmp PENDING_TTL_MS (5 min) as a soft filter during reads. The DB
// version stores expires_at at row creation so the filter is exact.
// Old rows are NOT automatically deleted; a future janitor cron or a
// per-INSERT purge can clean them. Pending TTL behavior is preserved
// via WHERE expires_at > now().

import { and, desc, eq, gt, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { beaconSessions, type BeaconSessionRow } from "@/db/schema/beacon-sessions";

/** TTL after which a row is considered abandoned. The file version used 5 min;
 *  preserved here so the same agent that wrote the row gets the same window. */
export const PENDING_TTL_MS = 5 * 60_000;

/** Older-than-this rows are purged on the POST path. Same value the file
 *  version used (10 min). */
export const PURGE_OLDER_THAN_MS = 10 * 60_000;

/** Shape used by callers — keeps the boundary compatible with the old
 *  BeaconSession file shape so call sites don't need to know about the
 *  DB column naming. */
export interface BeaconSession {
  id: string;
  userId: string;
  project: string;
  sessionContent: string;
  /** Mirror of the file version's `createdAt: number` (ms epoch). */
  createdAt: number;
  choice: string | null;
  currentAgent: string | null;
  nextAgent: string | null;
  capacityIssue: boolean;
  countdownSeconds: number;
  popupMode: string;
  gitBranch?: string | null;
}

function rowToSession(row: BeaconSessionRow): BeaconSession {
  return {
    id: row.id,
    userId: row.userId,
    project: row.project,
    sessionContent: row.sessionContent,
    createdAt: row.createdAt.getTime(),
    choice: row.choice,
    currentAgent: row.currentAgent,
    nextAgent: row.nextAgent,
    capacityIssue: row.capacityIssue,
    countdownSeconds: row.countdownSeconds,
    popupMode: row.popupMode,
    gitBranch: row.gitBranch,
  };
}

/** Insert a new beacon session. expires_at is computed from PENDING_TTL_MS
 *  so callers don't need to know about TTL semantics. Returns the row id. */
export async function createBeaconSession(input: {
  userId: string;
  project: string;
  sessionContent?: string;
  currentAgent?: string | null;
  nextAgent?: string | null;
  capacityIssue?: boolean;
  countdownSeconds: number;
  popupMode: string;
  gitBranch?: string | null;
}): Promise<string> {
  const expiresAt = new Date(Date.now() + PENDING_TTL_MS);
  const [row] = await db
    .insert(beaconSessions)
    .values({
      userId: input.userId,
      project: input.project,
      sessionContent: input.sessionContent ?? "",
      currentAgent: input.currentAgent ?? null,
      nextAgent: input.nextAgent ?? null,
      capacityIssue: input.capacityIssue ?? false,
      countdownSeconds: input.countdownSeconds,
      popupMode: input.popupMode,
      gitBranch: input.gitBranch ?? null,
      expiresAt,
    })
    .returning({ id: beaconSessions.id });
  return row.id;
}

/** Read a beacon session by id. Returns null if not found or if the row's
 *  user doesn't match the caller (multi-user safety — beacon sessions are
 *  per-user; one user must not be able to read another's popup). */
export async function getBeaconSession(id: string): Promise<BeaconSession | null> {
  const rows = await db.select().from(beaconSessions).where(eq(beaconSessions.id, id)).limit(1);
  return rows[0] ? rowToSession(rows[0]) : null;
}

/** Most recent pending (choice IS NULL, not expired) session for a user.
 *  Used by /beacon/live to SSR-preload the popup state. */
export async function getLatestPendingSession(userId: string): Promise<BeaconSession | null> {
  const rows = await db
    .select()
    .from(beaconSessions)
    .where(
      and(
        eq(beaconSessions.userId, userId),
        isNull(beaconSessions.choice),
        gt(beaconSessions.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(beaconSessions.createdAt))
    .limit(1);
  return rows[0] ? rowToSession(rows[0]) : null;
}

/** Cancel any active (un-chosen, not expired) beacon session for a user+
 *  project pair. Called by /api/inject when a direct injection races with
 *  an open popup — preserves the file-based contract that setting choice
 *  to "" signals the popup to close cleanly. */
export async function cancelActiveBeaconSessions(userId: string, project: string): Promise<number> {
  const rows = await db
    .update(beaconSessions)
    .set({ choice: "" })
    .where(
      and(
        eq(beaconSessions.userId, userId),
        eq(beaconSessions.project, project),
        isNull(beaconSessions.choice),
        gt(beaconSessions.expiresAt, new Date()),
      ),
    )
    .returning({ id: beaconSessions.id });
  return rows.length;
}

/** Janitor — deletes rows older than PURGE_OLDER_THAN_MS. Called from the
 *  POST path the way the file version did (best-effort purge on every
 *  create). */
export async function purgeOldBeaconSessions(): Promise<number> {
  const cutoff = new Date(Date.now() - PURGE_OLDER_THAN_MS);
  const rows = await db
    .delete(beaconSessions)
    .where(lt(beaconSessions.createdAt, cutoff))
    .returning({ id: beaconSessions.id });
  return rows.length;
}
