import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { getCurrentUserId } from "@/lib/session";
import { SUB_STATUS } from "@/lib/constants/statuses";
import { readJsonBody } from "@/lib/api/route-helpers";
import { CreateSubscriptionBody } from "@/db/queries/money";

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  const dataOrResp = await readJsonBody(req, CreateSubscriptionBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { name, vendor, amount, currency, frequency, nextDue, paymentMethod, notes } = dataOrResp;

  const [created] = await db
    .insert(subscriptions)
    .values({
      userId,
      name,
      vendor: vendor || null,
      amount: amount ?? null,
      currency,
      frequency,
      nextDue: nextDue ? new Date(nextDue) : null,
      paymentMethod: paymentMethod || null,
      notes: notes || null,
      status: SUB_STATUS.ACTIVE,
    })
    .returning();

  return NextResponse.json({ ok: true, subscription: created }, { status: 201 });
}
