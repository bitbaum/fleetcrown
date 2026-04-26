import { NextRequest, NextResponse } from "next/server";
import { getPersonDetail } from "@/db/queries/people";
import { readIdParam, readJsonBody, z } from "@/lib/api/route-helpers";
import { db } from "@/db";
import { entities } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { DEFAULT_USER_ID } from "@/lib/constants";

const PatchPersonBody = z
  .object({
    name: z.string().trim().min(1, "name cannot be empty").optional(),
    description: z.string().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const id = idOrResp;

  const dataOrResp = await readJsonBody(req, PatchPersonBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (dataOrResp.name !== undefined) patch.name = dataOrResp.name;
  if (dataOrResp.description !== undefined) patch.description = dataOrResp.description.trim() || null;

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
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const id = idOrResp;

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
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const person = await getPersonDetail(idOrResp);
  if (!person) return NextResponse.json(null, { status: 404 });

  return NextResponse.json(person);
}
