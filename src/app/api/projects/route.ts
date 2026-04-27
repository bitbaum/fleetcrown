import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { entities } from "@/db/schema";
import { DEFAULT_USER_ID, SOURCE_COCKPIT_UI } from "@/lib/constants";
import { ENTITY_TYPE } from "@/lib/constants/statuses";
import { readJsonBody } from "@/lib/api/route-helpers";
import { CreateProjectBody } from "@/db/queries/projects";

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, CreateProjectBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { name, description } = dataOrResp;

  try {
    const [created] = await db
      .insert(entities)
      .values({
        userId: DEFAULT_USER_ID,
        name,
        type: ENTITY_TYPE.PROJECT,
        description: description || null,
        source: SOURCE_COCKPIT_UI,
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
