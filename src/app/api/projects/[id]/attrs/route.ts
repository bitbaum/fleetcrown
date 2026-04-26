import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { db } from "@/db";
import { entities, attributes } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { readIdParam, readJsonBody, z } from "@/lib/api/route-helpers";

const SetAttrBody = z.object({
  key: z.string().trim().min(1, "key and value required"),
  value: z.string().trim().min(1, "key and value required"),
});

const DeleteAttrBody = z.object({
  key: z.string().trim().min(1, "key required"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const id = idOrResp;

  // Verify project belongs to user
  const [project] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.id, id), eq(entities.userId, DEFAULT_USER_ID)));
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const dataOrResp = await readJsonBody(req, SetAttrBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { key, value } = dataOrResp;

  // Upsert: insert or update on conflict (entity_id, key)
  await db
    .insert(attributes)
    .values({
      userId: DEFAULT_USER_ID,
      entityId: id,
      key: key.toLowerCase().replace(/\s+/g, "_"),
      value,
      source: "cockpit-ui",
    })
    .onConflictDoUpdate({
      target: [attributes.entityId, attributes.key],
      set: { value, updatedAt: new Date() },
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

  const dataOrResp = await readJsonBody(req, DeleteAttrBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  await db
    .delete(attributes)
    .where(
      and(
        eq(attributes.entityId, id),
        eq(attributes.key, dataOrResp.key),
        eq(attributes.userId, DEFAULT_USER_ID),
      ),
    );

  return NextResponse.json({ ok: true });
}
