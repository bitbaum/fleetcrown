import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { listActiveGoals, createGoal, CreateGoalBody } from "@/db/queries/goals";
import { readJsonBody } from "@/lib/api/route-helpers";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const items = await listActiveGoals(userId);
  return NextResponse.json({ goals: items });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dataOrResp = await readJsonBody(req, CreateGoalBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  try {
    const created = await createGoal(userId, dataOrResp);
    return NextResponse.json({ ok: true, goal: created }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create goal";
    if (msg === "Invalid entityId" || msg === "Invalid parentGoalId") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    throw e;
  }
}
