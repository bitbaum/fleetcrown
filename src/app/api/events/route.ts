import { NextRequest, NextResponse } from "next/server";
import { SOURCE_FLEETCROWN_UI } from "@/lib/constants";
import { getEvents, createEvent, CreateEventBody } from "@/db/queries/events";
import { readJsonBody } from "@/lib/api/route-helpers";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";

export async function GET() {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const { userId } = access;
  const items = await getEvents(userId);
  return NextResponse.json({ events: items });
}

export async function POST(req: NextRequest) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const { userId } = access;
  const dataOrResp = await readJsonBody(req, CreateEventBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const created = await createEvent(userId, dataOrResp, SOURCE_FLEETCROWN_UI);
  return NextResponse.json({ ok: true, event: created }, { status: 201 });
}
