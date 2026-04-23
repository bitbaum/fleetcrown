import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { commitments } from "@/db/schema";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { COMMITMENT_STATUS } from "@/lib/constants/statuses";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { description, dueDate, financialImpact } = body as {
    description?: string;
    dueDate?: string;
    financialImpact?: string;
  };

  if (!description?.trim()) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }

  const [created] = await db
    .insert(commitments)
    .values({
      userId: DEFAULT_USER_ID,
      description: description.trim(),
      dueDate: dueDate ? new Date(dueDate) : null,
      financialImpact: financialImpact?.trim() || null,
      status: COMMITMENT_STATUS.ACTIVE,
      source: "cockpit-ui",
    })
    .returning();

  return NextResponse.json({ ok: true, commitment: created }, { status: 201 });
}
