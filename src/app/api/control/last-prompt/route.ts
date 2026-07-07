/**
 * GET /api/control/last-prompt?tab=<projectKey>
 *
 * The single most-recent dispatch for one project — the read side of the Duet
 * watch view, which shows two agents' last prompts side by side and refetches
 * a pane whenever the bridge reports a state change for its project. Read-only;
 * scoped to the session user; delegates to the prompt-history SSOT.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { getLastPromptByProjectKey } from "@/db/queries/prompt-history";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tab = new URL(req.url).searchParams.get("tab")?.trim();
  if (!tab) return NextResponse.json({ error: "tab required" }, { status: 400 });

  const prompt = await getLastPromptByProjectKey(userId, tab);
  return NextResponse.json({ prompt });
}
