import { NextRequest, NextResponse } from "next/server";
import { getPersonDetail } from "@/db/queries/people";
import { isValidUuid } from "@/lib/utils";
import { db } from "@/db";
import { entities } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { DEFAULT_USER_ID } from "@/lib/constants";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isValidUuid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json();
  const allowed = ["description"] as const;
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key] === "" ? null : String(body[key]).trim() || null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  patch.updatedAt = new Date();

  const [updated] = await db
    .update(entities)
    .set(patch)
    .where(and(eq(entities.id, id), eq(entities.userId, DEFAULT_USER_ID)))
    .returning({ id: entities.id });

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isValidUuid(id)) {
    return NextResponse.json(null, { status: 400 });
  }

  const person = await getPersonDetail(id);

  if (!person) {
    return NextResponse.json(null, { status: 404 });
  }

  return NextResponse.json(person);
}
