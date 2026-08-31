import { NextRequest, NextResponse } from "next/server";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";
import { readIdParam, readJsonBody } from "@/lib/api/route-helpers";
import { patchCommitment, deleteCommitment, PatchCommitmentBody } from "@/db/queries/today";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const { userId } = access;
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const dataOrResp = await readJsonBody(req, PatchCommitmentBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const updated = await patchCommitment(userId, idOrResp, dataOrResp);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, commitment: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const { userId } = access;
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  await deleteCommitment(userId, idOrResp);
  return NextResponse.json({ ok: true });
}
