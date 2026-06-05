// Beacon popup creation + helpers — Change 4 (DB-backed).
//
// Previously this module wrote one JSON file per session to
// /tmp/<APP_SLUG>-beacon/<id>.json and read directly from the filesystem.
// That worked but had three drawbacks (see src/db/schema/beacon-sessions.ts
// for the rationale). The migration is a near-1:1 swap: the route shapes
// stay the same, just the storage moves to a DB table.
//
// Backward-compat: the named exports beaconPath / readBeaconSession /
// readLatestPendingSession / cancelActiveBeaconSessions kept their names
// where call sites depend on them; the implementations now delegate to
// src/db/queries/beacon-sessions.ts. beaconPath no longer makes sense for
// DB-backed storage and is removed — its three call sites switched to
// direct getBeaconSession() calls.

import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { isAgentId, looksLikeAgentCapacityIssue, resolveNextAvailableAgent, type Agent } from "@/lib/agent-registry";
import { DEFAULT_BEACON_COUNTDOWN_S, DEFAULT_POPUP_MODE } from "@/lib/constants/control";
import { getApiUserId } from "@/lib/session";
import { getBeaconSettings } from "@/db/queries/beacon-settings";
import {
  createBeaconSession,
  getBeaconSession as getBeaconSessionFromDb,
  getLatestPendingSession as getLatestPendingSessionFromDb,
  cancelActiveBeaconSessions as cancelActiveBeaconSessionsInDb,
  purgeOldBeaconSessions,
  type BeaconSession,
} from "@/db/queries/beacon-sessions";

// Re-export the type so callers that imported BeaconSession from this
// module continue to work without touching their imports.
export type { BeaconSession };

async function readConfiguredSettings(userId: string | null): Promise<{ countdownSeconds: number; popupMode: string }> {
  if (userId) {
    try {
      const s = await getBeaconSettings(userId);
      return { countdownSeconds: s.countdown_seconds, popupMode: s.popup_mode };
    } catch { /* DB hiccup — fall through to defaults */ }
  }
  return { countdownSeconds: DEFAULT_BEACON_COUNTDOWN_S, popupMode: DEFAULT_POPUP_MODE };
}

const CreateBody = z.object({
  project: z.string().max(200),
  sessionContent: z.string().max(20_000).default(""),
  currentAgent: z.string().max(40).optional(),
});

/** Read a beacon session by id. Backward-compatible name for callers that
 *  used the file-based version. Async now because storage is async. */
export async function readBeaconSession(id: string): Promise<BeaconSession | null> {
  return getBeaconSessionFromDb(id);
}

/** Most recent pending session for the caller's user. SSR-preload helper
 *  used by /beacon/live. Async now (was sync filesystem read).
 *
 *  Note: file version was userId-agnostic (it just scanned /tmp). DB
 *  version is user-scoped — safer, and the file version's lack of
 *  scoping was incidental rather than intentional. */
export async function readLatestPendingSession(userId: string): Promise<BeaconSession | null> {
  return getLatestPendingSessionFromDb(userId);
}

/**
 * Cancel any active beacon sessions for the given (user, tab). Setting
 * choice to "" preserves the file-based contract — beacon.py's polling
 * loop and the popup page both treat "" as "close cleanly." Called by
 * /api/inject so panel injections don't race with an open popup.
 *
 * The file version took only `tab` and scanned all sessions globally; the
 * DB version is properly user-scoped. Existing call sites that don't have
 * a userId in scope must add one (small fix at the call site).
 */
export async function cancelActiveBeaconSessions(userId: string, tab: string): Promise<number> {
  return cancelActiveBeaconSessionsInDb(userId, tab);
}

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, CreateBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  // Best-effort purge of stale rows on every create — matches the file
  // version's purge-on-POST behavior. Errors don't block the new session.
  purgeOldBeaconSessions().catch(() => {});

  const userId = await getApiUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { countdownSeconds, popupMode } = await readConfiguredSettings(userId);

  const currentAgent: Agent | null = isAgentId(dataOrResp.currentAgent) ? dataOrResp.currentAgent : "claude";
  const nextAgent = resolveNextAvailableAgent(dataOrResp.currentAgent ?? "claude");

  const id = await createBeaconSession({
    userId,
    project: dataOrResp.project,
    sessionContent: dataOrResp.sessionContent,
    currentAgent,
    nextAgent,
    capacityIssue: looksLikeAgentCapacityIssue(dataOrResp.sessionContent),
    countdownSeconds,
    popupMode,
  });

  return NextResponse.json({ id });
}
