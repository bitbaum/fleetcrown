import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { getEvents } from "@/db/queries/events";

export async function GET() {
  const items = await getEvents();
  return NextResponse.json({ events: items });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, type, description, url, deadline, category } = body as {
    name?: string;
    type?: string;
    description?: string;
    url?: string;
    deadline?: string;
    category?: string;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!type?.trim()) {
    return NextResponse.json({ error: "type is required" }, { status: 400 });
  }

  const [created] = await db
    .insert(events)
    .values({
      userId: DEFAULT_USER_ID,
      name: name.trim(),
      type: type.trim().toLowerCase(),
      description: description?.trim() || null,
      url: url?.trim() || null,
      deadline: deadline ? new Date(deadline) : null,
      category: category?.trim().toLowerCase() || null,
      status: "active",
      source: "cockpit-ui",
    })
    .returning();

  return NextResponse.json({ ok: true, event: created }, { status: 201 });
}
