import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { goals } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { isValidUuid } from "@/lib/utils";

export async function GET() {
  const items = await db
    .select({ id: goals.id, title: goals.title, status: goals.status, entityId: goals.entityId })
    .from(goals)
    .where(and(eq(goals.userId, DEFAULT_USER_ID), eq(goals.status, "active")))
    .orderBy(goals.title);
  return NextResponse.json({ goals: items });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, description, targetDate, parentGoalId } = body as {
    title?: string;
    description?: string;
    targetDate?: string;
    parentGoalId?: string;
  };

  if (!title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (parentGoalId && !isValidUuid(parentGoalId)) {
    return NextResponse.json({ error: "Invalid parentGoalId" }, { status: 400 });
  }

  const [created] = await db
    .insert(goals)
    .values({
      userId: DEFAULT_USER_ID,
      title: title.trim(),
      description: description?.trim() || null,
      targetDate: targetDate ? new Date(targetDate) : null,
      parentGoalId: parentGoalId || null,
      status: "active",
      progress: 0,
    })
    .returning();

  return NextResponse.json({ ok: true, goal: created }, { status: 201 });
}
