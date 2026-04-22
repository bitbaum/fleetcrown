import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { goals } from "@/db/schema";
import { DEFAULT_USER_ID } from "@/lib/constants";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (parentGoalId && !UUID_RE.test(parentGoalId)) {
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
