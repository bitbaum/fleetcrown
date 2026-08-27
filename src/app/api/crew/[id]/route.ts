import { NextRequest, NextResponse } from "next/server";
import { PatchCrewBody } from "@/config/crew";
import { isActorCapabilityError } from "@/config/actors";
import { getCrewMember, removeFromCrew, updateCrewProfile } from "@/db/queries/crew";
import { jsonOk, readIdParam, readJsonBody } from "@/lib/api/route-helpers";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const member = await getCrewMember(access.userId, idOrResp);
  if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return jsonOk({ member });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const dataOrResp = await readJsonBody(req, PatchCrewBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  try {
    const member = await updateCrewProfile(access.userId, idOrResp, dataOrResp);
    if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return jsonOk({ member });
  } catch (e: unknown) {
    if (isActorCapabilityError(e)) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    throw e;
  }
}

/** Leaves the loop, not the book: the person and every note about them stay. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const removed = await removeFromCrew(access.userId, idOrResp);
  if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return jsonOk();
}
