import { NextRequest, NextResponse } from "next/server";
import { SOURCE_FLEETCROWN_UI } from "@/lib/constants";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";
import { createCommitment, CreateCommitmentBody } from "@/db/queries/today";
import { readJsonBody } from "@/lib/api/route-helpers";

export async function POST(req: NextRequest) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const { userId } = access;
  const dataOrResp = await readJsonBody(req, CreateCommitmentBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const created = await createCommitment(userId, dataOrResp, SOURCE_FLEETCROWN_UI);
  return NextResponse.json({ ok: true, commitment: created }, { status: 201 });
}
