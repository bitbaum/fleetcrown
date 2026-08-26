import { NextRequest, NextResponse } from "next/server";
import { EnrolCrewBody } from "@/config/crew";
import { isActorCapabilityError } from "@/config/actors";
import { enrolCrew, getCrewSummary, listCrew } from "@/db/queries/crew";
import { jsonOk, readJsonBody, handleDuplicateEntityNameError } from "@/lib/api/route-helpers";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";

/** The roster is the operator's own address book, so it lives behind the same
 *  private-zone gate People does — not a shared directory, never a marketplace. */
export async function GET() {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const { userId } = access;

  const [crew, summary] = await Promise.all([listCrew(userId), getCrewSummary(userId)]);
  return jsonOk({ crew, summary });
}

export async function POST(req: NextRequest) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const { userId } = access;

  const dataOrResp = await readJsonBody(req, EnrolCrewBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  try {
    const member = await enrolCrew(userId, dataOrResp);
    if (!member) return NextResponse.json({ error: "Person not found" }, { status: 404 });
    return NextResponse.json({ ok: true, member }, { status: 201 });
  } catch (e: unknown) {
    if (isActorCapabilityError(e)) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    const dup = handleDuplicateEntityNameError(e, "person");
    if (dup) return dup;
    throw e;
  }
}
