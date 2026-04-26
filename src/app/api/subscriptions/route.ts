import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { VALID_FREQUENCIES, VALID_CURRENCIES, FREQUENCY } from "@/config/subscriptions";
import { SUB_STATUS } from "@/lib/constants/statuses";
import { readJsonBody, z } from "@/lib/api/route-helpers";

const CURRENCIES_ENUM = VALID_CURRENCIES as readonly [string, ...string[]];
const FREQUENCIES_ENUM = VALID_FREQUENCIES as readonly [string, ...string[]];

const CreateSubscriptionBody = z.object({
  name: z.string().trim().min(1, "name is required"),
  vendor: z.string().trim().optional(),
  amount: z.number().optional(),
  currency: z.enum(CURRENCIES_ENUM, { error: `currency must be one of: ${VALID_CURRENCIES.join(", ")}` }).default("CHF"),
  frequency: z.enum(FREQUENCIES_ENUM, { error: `frequency must be one of: ${VALID_FREQUENCIES.join(", ")}` }).default(FREQUENCY.MONTHLY),
  nextDue: z.string().optional(),
  paymentMethod: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, CreateSubscriptionBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { name, vendor, amount, currency, frequency, nextDue, paymentMethod, notes } = dataOrResp;

  const [created] = await db
    .insert(subscriptions)
    .values({
      userId: DEFAULT_USER_ID,
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
