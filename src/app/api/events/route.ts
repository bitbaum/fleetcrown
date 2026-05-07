import { NextRequest, NextResponse } from "next/server";
import { SOURCE_COCKPIT_UI } from "@/lib/constants";
import { getCurrentUserId } from "@/lib/session";
import { getEvents, createEvent, CreateEventBody } from "@/db/queries/events";
import { readJsonBody } from "@/lib/api/route-helpers";

export async function GET() {
  const userId = await getCurrentUserId();
  const items = await getEvents(userId);
  return NextResponse.json({ events: items });
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  const dataOrResp = await readJsonBody(req, CreateEventBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const created = await createEvent(userId, dataOrResp, SOURCE_COCKPIT_UI);
  return NextResponse.json({ ok: true, event: created }, { status: 201 });
}
