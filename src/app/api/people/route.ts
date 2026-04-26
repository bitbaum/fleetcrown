import { NextRequest, NextResponse } from "next/server";
import { searchPeople, type SortMode } from "@/db/queries/people";
import { db } from "@/db";
import { entities } from "@/db/schema";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { ENTITY_TYPE } from "@/lib/constants/statuses";
import { type RelationshipHealth, RELATIONSHIP_HEALTH_VALUES } from "@/lib/utils";
import { readJsonBody, z } from "@/lib/api/route-helpers";

const VALID_SORTS: SortMode[] = ["recent", "name", "health"];

const CreatePersonBody = z.object({
  name: z.string().trim().min(1, "name is required"),
  description: z.string().trim().optional(),
});

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, CreatePersonBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { name, description } = dataOrResp;

  try {
    const [created] = await db
      .insert(entities)
      .values({
        userId: DEFAULT_USER_ID,
        name,
        type: ENTITY_TYPE.PERSON,
        description: description || null,
        source: "cockpit-ui",
      })
      .returning({ id: entities.id, name: entities.name });

    return NextResponse.json({ ok: true, person: created }, { status: 201 });
  } catch (e: unknown) {
    // Unique constraint: (userId, name, type)
    if (e instanceof Error && e.message.includes("uq_entities_user_name_type")) {
      return NextResponse.json({ error: "A person with that name already exists" }, { status: 409 });
    }
    throw e;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").slice(0, 200);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);
  const sortRaw = searchParams.get("sort") ?? "recent";
  const sort: SortMode = VALID_SORTS.includes(sortRaw as SortMode) ? (sortRaw as SortMode) : "recent";

  const healthRaw = searchParams.get("health") ?? "";
  const health = healthRaw
    .split(",")
    .map((h) => h.trim())
    .filter((h): h is RelationshipHealth => (RELATIONSHIP_HEALTH_VALUES as readonly string[]).includes(h));

  const result = await searchPeople(q, limit, offset, sort, health);
  return NextResponse.json(result);
}
