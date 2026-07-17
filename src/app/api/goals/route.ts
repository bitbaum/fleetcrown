import { NextRequest, NextResponse } from "next/server";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";
import { listActiveGoals, createGoal, CreateGoalBody } from "@/db/queries/goals";
import { readJsonBody } from "@/lib/api/route-helpers";
import { scheduleProjectProfileReindexByEntityId } from "@/lib/rag/reindex-project-profile";

export async function GET() {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const { userId } = access;
  const items = await listActiveGoals(userId);
  return NextResponse.json({ goals: items });
}

export async function POST(req: NextRequest) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const { userId } = access;
  const dataOrResp = await readJsonBody(req, CreateGoalBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  try {
    const created = await createGoal(userId, dataOrResp);
    if (created.entityId) scheduleProjectProfileReindexByEntityId(userId, created.entityId);
    return NextResponse.json({ ok: true, goal: created }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create goal";
    if (msg === "Invalid entityId" || msg === "Invalid parentGoalId") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    throw e;
  }
}
