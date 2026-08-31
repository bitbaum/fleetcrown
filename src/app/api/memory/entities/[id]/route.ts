import { NextRequest, NextResponse } from "next/server";
import { readIdParam } from "@/lib/api/route-helpers";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";
import { forgetEntity } from "@/db/queries/memory";

/**
 * DELETE /api/memory/entities/[id] — forget one memory entity (data controls).
 * Attributes, interactions and relations cascade with it. PIN-gated.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const gone = await forgetEntity(access.userId, idOrResp);
  if (!gone) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
