import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { commitments } from "@/db/schema";
import { DEFAULT_USER_ID, SOURCE_COCKPIT_UI } from "@/lib/constants";
import { COMMITMENT_STATUS } from "@/lib/constants/statuses";
import { readJsonBody } from "@/lib/api/route-helpers";
import { CreateCommitmentBody } from "@/db/queries/today";

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, CreateCommitmentBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { description, dueDate, financialImpact } = dataOrResp;

  const [created] = await db
    .insert(commitments)
    .values({
      userId: DEFAULT_USER_ID,
      description,
      dueDate: dueDate ? new Date(dueDate) : null,
      financialImpact: financialImpact || null,
      status: COMMITMENT_STATUS.ACTIVE,
      source: SOURCE_COCKPIT_UI,
    })
    .returning();

  return NextResponse.json({ ok: true, commitment: created }, { status: 201 });
}
