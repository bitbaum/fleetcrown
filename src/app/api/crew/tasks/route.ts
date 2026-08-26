import { NextRequest, NextResponse } from "next/server";
import { CreateHumanTaskBody, isHumanTaskStatus, type HumanTaskStatus } from "@/config/crew";
import { isActorCapabilityError } from "@/config/actors";
import { createHumanTask, listHumanTasks } from "@/db/queries/human-tasks";
import { jsonOk, readJsonBody } from "@/lib/api/route-helpers";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";
import { isValidUuid } from "@/lib/utils";

export async function GET(request: Request) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;

  const { searchParams } = new URL(request.url);
  const status = (searchParams.get("status") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is HumanTaskStatus => isHumanTaskStatus(s));
  const assigneeId = searchParams.get("assigneeId");
  const projectId = searchParams.get("projectId");

  const tasks = await listHumanTasks(access.userId, {
    status: status.length ? status : undefined,
    assigneeId: assigneeId && isValidUuid(assigneeId) ? assigneeId : undefined,
    projectId: projectId && isValidUuid(projectId) ? projectId : undefined,
  });
  return jsonOk({ tasks });
}

export async function POST(req: NextRequest) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;

  const dataOrResp = await readJsonBody(req, CreateHumanTaskBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  try {
    // Always born a draft. Handing it to a human is a second, explicit act.
    const task = await createHumanTask(access.userId, dataOrResp);
    if (!task) return NextResponse.json({ error: "Could not create assignment" }, { status: 500 });
    return NextResponse.json({ ok: true, task }, { status: 201 });
  } catch (e: unknown) {
    if (isActorCapabilityError(e)) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    throw e;
  }
}
