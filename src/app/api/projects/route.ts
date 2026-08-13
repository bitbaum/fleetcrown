import { NextRequest, NextResponse } from "next/server";
import { SOURCE_FLEETCROWN_UI } from "@/lib/constants";
import { getApiUserId } from "@/lib/session";
import { createProject, CreateProjectBody } from "@/db/queries/projects";
import { readJsonBody, handleDuplicateEntityNameError } from "@/lib/api/route-helpers";
import { scheduleProjectProfileReindexByEntityId } from "@/lib/rag/reindex-project-profile";

export async function POST(req: NextRequest) {
  // getApiUserId = session OR ck_* agent bearer, so Loki's fleet skill can
  // register a repo it's about to dispatch to (same-user credential either way).
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dataOrResp = await readJsonBody(req, CreateProjectBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  try {
    const created = await createProject(userId, dataOrResp, SOURCE_FLEETCROWN_UI);
    scheduleProjectProfileReindexByEntityId(userId, created.id);
    return NextResponse.json({ ok: true, project: created }, { status: 201 });
  } catch (e: unknown) {
    const dup = handleDuplicateEntityNameError(e, "project");
    if (dup) return dup;
    throw e;
  }
}
