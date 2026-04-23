import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { entities } from "@/db/schema";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { ENTITY_TYPE } from "@/lib/constants/statuses";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, description } = body as { name?: string; description?: string };

  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const [created] = await db
      .insert(entities)
      .values({
        userId: DEFAULT_USER_ID,
        name: name.trim(),
        type: ENTITY_TYPE.PROJECT,
        description: description?.trim() || null,
        source: "cockpit-ui",
      })
      .returning({ id: entities.id, name: entities.name });

    return NextResponse.json({ ok: true, project: created }, { status: 201 });
  } catch (e: unknown) {
    // Unique constraint: (userId, name, type)
    if (e instanceof Error && e.message.includes("uq_entities_user_name_type")) {
      return NextResponse.json({ error: "A project with that name already exists" }, { status: 409 });
    }
    throw e;
  }
}
