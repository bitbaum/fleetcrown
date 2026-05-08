import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { beaconPath, readBeaconSession } from "@/app/api/beacon/route";

const RespondBody = z.object({
  choice: z.string().min(1).max(2000),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = readBeaconSession(id);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(session);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = readBeaconSession(id);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const dataOrResp = await readJsonBody(req, RespondBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  session.choice = dataOrResp.choice;
  fs.writeFileSync(beaconPath(id), JSON.stringify(session));
  return NextResponse.json({ ok: true });
}
