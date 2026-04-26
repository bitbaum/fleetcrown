import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { events } from "@/db/schema";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { EVENT_STATUS } from "@/lib/constants/statuses";
import { getEvents } from "@/db/queries/events";
import { readJsonBody, z } from "@/lib/api/route-helpers";

// readJsonBody auto-translates zod's "invalid_type for missing field"
// into "<field> is required", so plain .min(1) covers both the missing
// and empty/whitespace cases.
const CreateEventBody = z.object({
  name: z.string().trim().min(1, "name is required"),
  type: z.string().trim().min(1, "type is required"),
  description: z.string().trim().optional(),
  url: z.string().trim().optional(),
  deadline: z.string().optional(),
  category: z.string().trim().optional(),
});

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
      source: "cockpit-ui",
    })
    .returning();

  return NextResponse.json({ ok: true, event: created }, { status: 201 });
}
