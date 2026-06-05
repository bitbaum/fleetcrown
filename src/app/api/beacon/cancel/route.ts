import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";
import { cancelActiveBeaconSessions } from "@/app/api/beacon/route";

const Body = z.object({ tab: z.string().max(200) });

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await readJsonBody(req, Body);
  if (body instanceof NextResponse) return body;
  await cancelActiveBeaconSessions(userId, body.tab);
  return NextResponse.json({ ok: true });
}
