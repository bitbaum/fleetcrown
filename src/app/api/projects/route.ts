import { NextRequest, NextResponse } from "next/server";
import { SOURCE_COCKPIT_UI } from "@/lib/constants";
import { db } from "@/db";
import { entities } from "@/db/schema";
import { getCurrentUserId } from "@/lib/session";
import { ENTITY_TYPE } from "@/lib/constants/statuses";
import { readJsonBody, handleDuplicateEntityNameError } from "@/lib/api/route-helpers";
import { CreateProjectBody } from "@/db/queries/projects";

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  const dataOrResp = await readJsonBody(req, CreateProjectBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { name, description } = dataOrResp;

  try {
    const [created] = await db
      .insert(entities)
      .values({
        userId,
        name,
        type: ENTITY_TYPE.PROJECT,
        description: description || null,
        source: SOURCE_COCKPIT_UI,
      })
      .returning({ id: entities.id, name: entities.name });

    return NextResponse.json({ ok: true, project: created }, { status: 201 });
  } catch (e: unknown) {
    const dup = handleDuplicateEntityNameError(e, "project");
    if (dup) return dup;
    throw e;
  }
}
