import { NextRequest, NextResponse } from "next/server";
import { SOURCE_COCKPIT_UI } from "@/lib/constants";
import { db } from "@/db";
import { commitments } from "@/db/schema";
import { getCurrentUserId } from "@/lib/session";
import { COMMITMENT_STATUS } from "@/lib/constants/statuses";
import { readJsonBody } from "@/lib/api/route-helpers";
import { CreateCommitmentBody } from "@/db/queries/today";

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  const dataOrResp = await readJsonBody(req, CreateCommitmentBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { description, dueDate, financialImpact } = dataOrResp;

  const [created] = await db
    .insert(commitments)
    .values({
      userId,
      description,
      dueDate: dueDate ? new Date(dueDate) : null,
      financialImpact: financialImpact || null,
      status: COMMITMENT_STATUS.ACTIVE,
      source: SOURCE_COCKPIT_UI,
    })
    .returning();

  return NextResponse.json({ ok: true, commitment: created }, { status: 201 });
}
