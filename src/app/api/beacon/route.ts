import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { isAgentId, looksLikeAgentCapacityIssue, resolveNextAvailableAgent, type Agent } from "@/lib/agent-registry";
import { DEFAULT_BEACON_COUNTDOWN_S, DEFAULT_POPUP_MODE } from "@/lib/constants/control";
import { getApiUserId } from "@/lib/session";
import { getBeaconSettings } from "@/db/queries/beacon-settings";
import { APP_SLUG } from "@/config/brand";

const BEACON_DIR = `/tmp/${APP_SLUG}-beacon`;

export type BeaconSession = {
  id: string;
  project: string;
  sessionContent: string;
  createdAt: number;
  choice: string | null;
  currentAgent: Agent | null;
  nextAgent: Agent | null;
  capacityIssue: boolean;
  countdownSeconds: number;
  popupMode: string;
  gitBranch?: string | null;
};

async function readConfiguredSettings(): Promise<{ countdownSeconds: number; popupMode: string }> {
  try {
    const userId = await getApiUserId();
    if (userId) {
      const s = await getBeaconSettings(userId);
      return { countdownSeconds: s.countdown_seconds, popupMode: s.popup_mode };
    }
  } catch { /* no auth or DB error — use defaults */ }
  return { countdownSeconds: DEFAULT_BEACON_COUNTDOWN_S, popupMode: DEFAULT_POPUP_MODE };
}

const CreateBody = z.object({
  project: z.string().max(200),
  sessionContent: z.string().max(20_000).default(""),
  currentAgent: z.string().max(40).optional(),
});

export function beaconPath(id: string): string {
  return path.join(BEACON_DIR, `${id}.json`);
}

export function readBeaconSession(id: string): BeaconSession | null {
  try {
    return JSON.parse(fs.readFileSync(beaconPath(id), "utf-8")) as BeaconSession;
  } catch {
    return null;
  }
}

/**
 * Return the most recently created pending session, if any. Used by the
 * /beacon/live page to SSR-preload the popup state so the first paint
 * already shows the Ready UI instead of the Standby placeholder.
 *
 * Only sessions younger than 5 minutes are considered pending. Older entries
 * in /tmp/cockpit-beacon are abandoned (the agent process that wrote them is
 * almost certainly gone) — surfacing them as "pending" makes the popup look
 * empty / show stale content. A separate purge happens on the POST path.
 */
const PENDING_TTL_MS = 5 * 60_000;

export function readLatestPendingSession(): BeaconSession | null {
  try {
    const minCreatedAt = Date.now() - PENDING_TTL_MS;
    let best: BeaconSession | null = null;
    for (const file of fs.readdirSync(BEACON_DIR)) {
      if (!file.endsWith(".json")) continue;
      try {
        const s = JSON.parse(fs.readFileSync(path.join(BEACON_DIR, file), "utf-8")) as BeaconSession;
        if (s.choice !== null) continue;
        if (s.createdAt < minCreatedAt) continue;
        if (!best || s.createdAt > best.createdAt) best = s;
      } catch { /* skip unreadable */ }
    }
    return best;
  } catch {
    return null;
  }
}

/**
 * Cancel any active beacon sessions for the given tab (project name).
 * Setting choice to "" signals beacon.py's polling loop to exit cleanly,
 * and the beacon popup page polls the same endpoint and closes itself.
 * Called by /api/inject so panel injections don't race with an open popup.
 */
export function cancelActiveBeaconSessions(tab: string): void {
  try {
    const cutoff = Date.now() - 150_000;
    for (const file of fs.readdirSync(BEACON_DIR)) {
      if (!file.endsWith(".json")) continue;
      try {
        const p = path.join(BEACON_DIR, file);
        const s = JSON.parse(fs.readFileSync(p, "utf-8")) as BeaconSession;
        if (s.project === tab && s.choice === null && s.createdAt > cutoff) {
          fs.writeFileSync(p, JSON.stringify({ ...s, choice: "" }));
        }
      } catch { /* corrupt or race-deleted file */ }
    }
  } catch { /* BEACON_DIR doesn't exist — nothing to cancel */ }
}

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, CreateBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  fs.mkdirSync(BEACON_DIR, { recursive: true });

  // Purge sessions older than 10 minutes to prevent /tmp accumulation.
  const purge = Date.now() - 600_000;
  for (const file of fs.readdirSync(BEACON_DIR)) {
    if (!file.endsWith(".json")) continue;
    try {
      const p = path.join(BEACON_DIR, file);
      const s = JSON.parse(fs.readFileSync(p, "utf-8")) as BeaconSession;
      if (s.createdAt < purge) fs.unlinkSync(p);
    } catch { /* corrupt or already deleted */ }
  }

  const { countdownSeconds, popupMode } = await readConfiguredSettings();

  const session: BeaconSession = {
    id: randomUUID(),
    project: dataOrResp.project,
    sessionContent: dataOrResp.sessionContent,
    createdAt: Date.now(),
    choice: null,
    currentAgent: isAgentId(dataOrResp.currentAgent) ? dataOrResp.currentAgent : "claude",
    nextAgent: resolveNextAvailableAgent(dataOrResp.currentAgent ?? "claude"),
    capacityIssue: looksLikeAgentCapacityIssue(dataOrResp.sessionContent),
    countdownSeconds,
    popupMode,
  };
  fs.writeFileSync(beaconPath(session.id), JSON.stringify(session));
  return NextResponse.json({ id: session.id });
}
