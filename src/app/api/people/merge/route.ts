import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";
import { readJsonBody } from "@/lib/api/route-helpers";
import { mergePeoplePair } from "@/db/queries/people-merge";

const Body = z.object({
  keepId: z.string().uuid(),
  dropId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const dataOrResp = await readJsonBody(req, Body);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  try {
    const result = await mergePeoplePair(access.userId, dataOrResp.keepId, dataOrResp.dropId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Merge failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
