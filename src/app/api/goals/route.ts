import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/session";
import { listActiveGoals, createGoal, CreateGoalBody } from "@/db/queries/goals";
import { readJsonBody } from "@/lib/api/route-helpers";

export async function GET() {
  const userId = await getCurrentUserId();
  const items = await listActiveGoals(userId);
  return NextResponse.json({ goals: items });
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  const dataOrResp = await readJsonBody(req, CreateGoalBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const created = await createGoal(userId, dataOrResp);
  return NextResponse.json({ ok: true, goal: created }, { status: 201 });
}
