import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentUserId } from "@/lib/session";
import { readIdParam, readJsonBody } from "@/lib/api/route-helpers";
import { PatchEventBody } from "@/db/queries/events";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getCurrentUserId();
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const id = idOrResp;

  const dataOrResp = await readJsonBody(req, PatchEventBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const { status, name, description, url, deadline } = dataOrResp;
  const [updated] = await db
    .update(events)
    .set({
      ...(status !== undefined && { status }),
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(url !== undefined && { url }),
      ...(deadline !== undefined && { deadline: deadline ? new Date(deadline) : null }),
      updatedAt: new Date(),
    })
    .where(and(eq(events.id, id), eq(events.userId, userId)))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, event: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getCurrentUserId();
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const id = idOrResp;

  await db
    .delete(events)
    .where(and(eq(events.id, id), eq(events.userId, userId)));

  return NextResponse.json({ ok: true });
}
