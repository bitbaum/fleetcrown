import { NextRequest, NextResponse } from "next/server";
import { readIdParam, readJsonBody } from "@/lib/api/route-helpers";
import {
  upsertEntityAttribute,
  deleteEntityAttribute,
  SetAttrBody,
  DeleteAttrBody,
} from "@/db/queries/utils";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";
import { isActorCapabilityError } from "@/config/actors";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const { userId } = access;
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const dataOrResp = await readJsonBody(req, SetAttrBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  try {
    const ok = await upsertEntityAttribute(userId, idOrResp, dataOrResp.key, dataOrResp.value);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (isActorCapabilityError(e)) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    throw e;
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const { userId } = access;
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const dataOrResp = await readJsonBody(req, DeleteAttrBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  await deleteEntityAttribute(userId, idOrResp, dataOrResp.key);
  return NextResponse.json({ ok: true });
}
