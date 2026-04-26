import { NextRequest, NextResponse } from "next/server";
import { readIdParam, readJsonBody, z } from "@/lib/api/route-helpers";
import { upsertEntityAttribute, deleteEntityAttribute } from "@/db/queries/utils";

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

  const dataOrResp = await readJsonBody(req, SetAttrBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const ok = await upsertEntityAttribute(idOrResp, dataOrResp.key, dataOrResp.value);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const dataOrResp = await readJsonBody(req, DeleteAttrBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  await deleteEntityAttribute(idOrResp, dataOrResp.key);
  return NextResponse.json({ ok: true });
}
