import { NextRequest, NextResponse } from "next/server";
import { createSubscription, CreateSubscriptionBody } from "@/db/queries/money";
import { readJsonBody } from "@/lib/api/route-helpers";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";

export async function POST(req: NextRequest) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const { userId } = access;
  const dataOrResp = await readJsonBody(req, CreateSubscriptionBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const created = await createSubscription(userId, dataOrResp);
  return NextResponse.json({ ok: true, subscription: created }, { status: 201 });
}
