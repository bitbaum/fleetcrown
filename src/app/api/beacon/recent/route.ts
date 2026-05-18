import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { getRecentCustomPromptsByProjectKey } from "@/db/queries/prompt-history";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const project = req.nextUrl.searchParams.get("project");
  if (!project) return NextResponse.json([]);
  try {
    const prompts = await getRecentCustomPromptsByProjectKey(userId, project);
    return NextResponse.json(prompts);
  } catch {
    return NextResponse.json([]);
  }
}
