import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { cancelActiveBeaconSessions } from "@/app/api/beacon/route";

const Body = z.object({ tab: z.string().max(200) });

export async function POST(req: NextRequest) {
  const body = await readJsonBody(req, Body);
  if (body instanceof NextResponse) return body;
  cancelActiveBeaconSessions(body.tab);
  return NextResponse.json({ ok: true });
}
