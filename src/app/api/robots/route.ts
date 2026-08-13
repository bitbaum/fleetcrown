import { NextRequest, NextResponse } from "next/server";
import { searchRobots, createRobot, CreateRobotBody } from "@/db/queries/robots";
import { readJsonBody, handleDuplicateEntityNameError } from "@/lib/api/route-helpers";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";
import { isActorCapabilityError } from "@/config/actors";

export async function POST(req: NextRequest) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const { userId } = access;
  const dataOrResp = await readJsonBody(req, CreateRobotBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  try {
    const created = await createRobot(userId, dataOrResp);
    return NextResponse.json({ ok: true, robot: created }, { status: 201 });
  } catch (e: unknown) {
    if (isActorCapabilityError(e)) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    const dup = handleDuplicateEntityNameError(e, "robot");
    if (dup) return dup;
    throw e;
  }
}

export async function GET(request: Request) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const { userId } = access;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").slice(0, 200);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);

  const result = await searchRobots(userId, q, limit, offset);
  return NextResponse.json(result);
}
