import { NextRequest, NextResponse } from "next/server";
import { getPersonDetail, patchPerson, deletePerson, PatchPersonBody } from "@/db/queries/people";
import { readIdParam, readJsonBody } from "@/lib/api/route-helpers";
import { getSessionUserId } from "@/lib/session";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const dataOrResp = await readJsonBody(req, PatchPersonBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  try {
    const updated = await patchPerson(userId, idOrResp, dataOrResp);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && e.code === "23505") {
      return NextResponse.json({ error: "A person with that name already exists" }, { status: 409 });
    }
    throw e;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const deleted = await deletePerson(userId, idOrResp);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const person = await getPersonDetail(userId, idOrResp);
  if (!person) return NextResponse.json(null, { status: 404 });

  return NextResponse.json(person);
}
