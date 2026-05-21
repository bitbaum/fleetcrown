import { NextRequest, NextResponse } from "next/server";
import { readIdParam, readJsonBody } from "@/lib/api/route-helpers";
import { createEntityInteraction, CreateInteractionBody } from "@/db/queries/utils";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const { userId } = access;
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const dataOrResp = await readJsonBody(req, CreateInteractionBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const created = await createEntityInteraction(userId, idOrResp, dataOrResp);
  if (!created) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, interaction: created }, { status: 201 });
}
