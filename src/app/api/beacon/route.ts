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
