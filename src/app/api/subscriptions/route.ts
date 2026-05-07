import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/session";
import { createSubscription, CreateSubscriptionBody } from "@/db/queries/money";
import { readJsonBody } from "@/lib/api/route-helpers";

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  const dataOrResp = await readJsonBody(req, CreateSubscriptionBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const created = await createSubscription(userId, dataOrResp);
  return NextResponse.json({ ok: true, subscription: created }, { status: 201 });
}
