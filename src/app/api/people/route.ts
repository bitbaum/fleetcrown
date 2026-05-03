import { NextRequest, NextResponse } from "next/server";
import { SOURCE_COCKPIT_UI } from "@/lib/constants";
import { searchPeople, SORT_MODE, type SortMode } from "@/db/queries/people";
import { db } from "@/db";
import { entities } from "@/db/schema";
import { getCurrentUserId } from "@/lib/session";
import { ENTITY_TYPE } from "@/lib/constants/statuses";
import { type RelationshipHealth, RELATIONSHIP_HEALTH_VALUES } from "@/lib/utils";
import { readJsonBody, handleDuplicateEntityNameError } from "@/lib/api/route-helpers";
import { CreatePersonBody } from "@/db/queries/people";

const VALID_SORTS: SortMode[] = Object.values(SORT_MODE);

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  const dataOrResp = await readJsonBody(req, CreatePersonBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { name, description } = dataOrResp;

  try {
    const [created] = await db
      .insert(entities)
      .values({
        userId,
        name,
        type: ENTITY_TYPE.PERSON,
        description: description || null,
        source: SOURCE_COCKPIT_UI,
      })
      .returning({ id: entities.id, name: entities.name });

    return NextResponse.json({ ok: true, person: created }, { status: 201 });
  } catch (e: unknown) {
    const dup = handleDuplicateEntityNameError(e, "person");
    if (dup) return dup;
    throw e;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").slice(0, 200);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);
  const sortRaw = searchParams.get("sort") ?? SORT_MODE.RECENT;
  const sort: SortMode = VALID_SORTS.includes(sortRaw as SortMode) ? (sortRaw as SortMode) : SORT_MODE.RECENT;

  const healthRaw = searchParams.get("health") ?? "";
  const health = healthRaw
    .split(",")
    .map((h) => h.trim())
    .filter((h): h is RelationshipHealth => (RELATIONSHIP_HEALTH_VALUES as readonly string[]).includes(h));

  const result = await searchPeople(q, limit, offset, sort, health);
  return NextResponse.json(result);
}
