import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { isAgentId, looksLikeAgentCapacityIssue, resolveNextAvailableAgent, type Agent } from "@/lib/agent-registry";
import { BEACON_SETTINGS_PATH } from "@/config/beacon";
import { DEFAULT_BEACON_COUNTDOWN_S } from "@/lib/constants/control";

const BEACON_DIR = "/tmp/cockpit-beacon";

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
  gitBranch?: string | null;
};

function readConfiguredCountdown(): number {
  try {
    const raw = JSON.parse(fs.readFileSync(BEACON_SETTINGS_PATH, "utf-8")) as Record<string, unknown>;
    const n = raw.countdown_seconds;
    return typeof n === "number" && n > 0 ? n : DEFAULT_BEACON_COUNTDOWN_S;
  } catch {
    return DEFAULT_BEACON_COUNTDOWN_S;
  }
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

  const session: BeaconSession = {
    id: randomUUID(),
    project: dataOrResp.project,
    sessionContent: dataOrResp.sessionContent,
    createdAt: Date.now(),
    choice: null,
    currentAgent: isAgentId(dataOrResp.currentAgent) ? dataOrResp.currentAgent : "claude",
    nextAgent: resolveNextAvailableAgent(dataOrResp.currentAgent ?? "claude"),
    capacityIssue: looksLikeAgentCapacityIssue(dataOrResp.sessionContent),
    countdownSeconds: readConfiguredCountdown(),
  };
  fs.writeFileSync(beaconPath(session.id), JSON.stringify(session));
  return NextResponse.json({ id: session.id });
}
