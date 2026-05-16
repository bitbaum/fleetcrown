import { NextRequest, NextResponse } from "next/server";
import { SOURCE_COCKPIT_UI } from "@/lib/constants";
import { getSessionUserId } from "@/lib/session";
import { createCommitment, CreateCommitmentBody } from "@/db/queries/today";
import { readJsonBody } from "@/lib/api/route-helpers";

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dataOrResp = await readJsonBody(req, CreateCommitmentBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const created = await createCommitment(userId, dataOrResp, SOURCE_COCKPIT_UI);
  return NextResponse.json({ ok: true, commitment: created }, { status: 201 });
}
