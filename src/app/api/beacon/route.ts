import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { readJsonBody, z } from "@/lib/api/route-helpers";

const BEACON_DIR = "/tmp/cockpit-beacon";

export type BeaconSession = {
  id: string;
  project: string;
  sessionContent: string;
  createdAt: number;
  choice: string | null;
};

const CreateBody = z.object({
  project: z.string().max(200),
  sessionContent: z.string().max(20_000).default(""),
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
  const session: BeaconSession = {
    id: randomUUID(),
    project: dataOrResp.project,
    sessionContent: dataOrResp.sessionContent,
    createdAt: Date.now(),
    choice: null,
  };
  fs.writeFileSync(beaconPath(session.id), JSON.stringify(session));
  return NextResponse.json({ id: session.id });
}
