import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { goals } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentUserId } from "@/lib/session";
import { GOAL_STATUS } from "@/lib/constants/statuses";
import { readJsonBody } from "@/lib/api/route-helpers";
import { CreateGoalBody } from "@/db/queries/goals";

export async function GET() {
  const userId = await getCurrentUserId();
  const items = await db
    .select({ id: goals.id, title: goals.title, status: goals.status, entityId: goals.entityId })
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.status, GOAL_STATUS.ACTIVE)))
    .orderBy(goals.title);
  return NextResponse.json({ goals: items });
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  const dataOrResp = await readJsonBody(req, CreateGoalBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { title, description, targetDate, parentGoalId } = dataOrResp;

  const [created] = await db
    .insert(goals)
    .values({
      userId,
      title,
      description: description || null,
      targetDate: targetDate ? new Date(targetDate) : null,
      parentGoalId: parentGoalId || null,
      status: GOAL_STATUS.ACTIVE,
      progress: 0,
    })
    .returning();

  return NextResponse.json({ ok: true, goal: created }, { status: 201 });
}
