import { NextRequest, NextResponse } from "next/server";
import { getRobotDetail, patchRobot, deleteRobot, PatchRobotBody } from "@/db/queries/robots";
import { readIdParam, readJsonBody, isUniqueViolation } from "@/lib/api/route-helpers";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";
import { isActorCapabilityError } from "@/config/actors";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const { userId } = access;
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const robot = await getRobotDetail(userId, idOrResp);
  if (!robot) return NextResponse.json(null, { status: 404 });
  return NextResponse.json(robot);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const { userId } = access;
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const dataOrResp = await readJsonBody(req, PatchRobotBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  try {
    const updated = await patchRobot(userId, idOrResp, dataOrResp);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, robot: updated });
  } catch (e: unknown) {
    if (isActorCapabilityError(e)) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "A robot with that name already exists" }, { status: 409 });
    }
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const { userId } = access;
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const deleted = await deleteRobot(userId, idOrResp);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
