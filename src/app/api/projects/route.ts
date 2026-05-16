import { NextRequest, NextResponse } from "next/server";
import { SOURCE_COCKPIT_UI } from "@/lib/constants";
import { getSessionUserId } from "@/lib/session";
import { createProject, CreateProjectBody } from "@/db/queries/projects";
import { readJsonBody, handleDuplicateEntityNameError } from "@/lib/api/route-helpers";

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dataOrResp = await readJsonBody(req, CreateProjectBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  try {
    const created = await createProject(userId, dataOrResp, SOURCE_COCKPIT_UI);
    return NextResponse.json({ ok: true, project: created }, { status: 201 });
  } catch (e: unknown) {
    const dup = handleDuplicateEntityNameError(e, "project");
    if (dup) return dup;
    throw e;
  }
}
