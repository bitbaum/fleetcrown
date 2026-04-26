import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { db } from "@/db";
import { entities, attributes } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { readIdParam } from "@/lib/api/route-helpers";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const id = idOrResp;

  const [person] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.id, id), eq(entities.userId, DEFAULT_USER_ID)));
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { key, value } = body as { key: string; value: string };
  if (!key?.trim() || !value?.trim()) {
    return NextResponse.json({ error: "key and value required" }, { status: 400 });
  }

  await db
    .insert(attributes)
    .values({
      userId: DEFAULT_USER_ID,
      entityId: id,
      key: key.trim().toLowerCase().replace(/\s+/g, "_"),
      value: value.trim(),
      source: "cockpit-ui",
    })
    .onConflictDoUpdate({
      target: [attributes.entityId, attributes.key],
      set: { value: value.trim(), updatedAt: new Date() },
    });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const id = idOrResp;

  const { key } = await req.json();
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });

  await db
    .delete(attributes)
    .where(
      and(
        eq(attributes.entityId, id),
        eq(attributes.key, key),
        eq(attributes.userId, DEFAULT_USER_ID),
      ),
    );

  return NextResponse.json({ ok: true });
}
