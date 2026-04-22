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
  const patch: Record<string, unknown> = {};

  if ("description" in body) {
    patch.description = body.description === "" ? null : String(body.description).trim() || null;
  }
  if ("name" in body) {
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    patch.name = name;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  patch.updatedAt = new Date();

  try {
    const [updated] = await db
      .update(entities)
      .set(patch)
      .where(and(eq(entities.id, id), eq(entities.userId, DEFAULT_USER_ID)))
      .returning({ id: entities.id });

    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && e.code === "23505") {
      return NextResponse.json({ error: "A person with that name already exists" }, { status: 409 });
    }
    throw e;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isValidUuid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [deleted] = await db
    .delete(entities)
    .where(and(eq(entities.id, id), eq(entities.userId, DEFAULT_USER_ID)))
    .returning({ id: entities.id });

  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
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
