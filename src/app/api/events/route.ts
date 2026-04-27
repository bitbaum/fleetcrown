import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { events } from "@/db/schema";
import { DEFAULT_USER_ID, SOURCE_COCKPIT_UI } from "@/lib/constants";
import { EVENT_STATUS } from "@/lib/constants/statuses";
import { getEvents, CreateEventBody } from "@/db/queries/events";
import { readJsonBody } from "@/lib/api/route-helpers";

export async function GET() {
  const items = await getEvents();
  return NextResponse.json({ events: items });
}

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, CreateEventBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { name, type, description, url, deadline, category } = dataOrResp;

  const [created] = await db
    .insert(events)
    .values({
      userId: DEFAULT_USER_ID,
      name,
      type: type.toLowerCase(),
      description: description || null,
      url: url || null,
      deadline: deadline ? new Date(deadline) : null,
      category: category?.toLowerCase() || null,
      status: EVENT_STATUS.ACTIVE,
      source: SOURCE_COCKPIT_UI,
    })
    .returning();

  return NextResponse.json({ ok: true, event: created }, { status: 201 });
}
