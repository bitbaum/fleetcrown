import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { readIdParam } from "@/lib/api/route-helpers";
import { generateBusinessPlan } from "@/lib/business-plan";

// Generate (or iterate) the project's living business plan. Folds in the
// profile, sibling projects, and recent agent activity; persists the plan +
// dispatchable actions as attributes. POST is idempotent in spirit — calling
// it again iterates the existing plan rather than starting over.

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  try {
    const result = await generateBusinessPlan(userId, idOrResp);
    if (result === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, plan: result.plan, actions: result.actions });
  } catch (e) {
    return NextResponse.json(
      { error: "Plan generation failed — try again in a moment.", details: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
