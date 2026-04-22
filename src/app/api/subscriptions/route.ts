import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { VALID_FREQUENCIES, VALID_CURRENCIES } from "@/config/subscriptions";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, vendor, amount, currency, frequency, nextDue, paymentMethod, notes } = body as {
    name?: string;
    vendor?: string;
    amount?: number;
    currency?: string;
    frequency?: string;
    nextDue?: string;
    paymentMethod?: string;
    notes?: string;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (currency && !VALID_CURRENCIES.includes(currency as typeof VALID_CURRENCIES[number])) {
    return NextResponse.json({ error: `currency must be one of: ${VALID_CURRENCIES.join(", ")}` }, { status: 400 });
  }
  if (frequency && !VALID_FREQUENCIES.includes(frequency as typeof VALID_FREQUENCIES[number])) {
    return NextResponse.json({ error: `frequency must be one of: ${VALID_FREQUENCIES.join(", ")}` }, { status: 400 });
  }

  const [created] = await db
    .insert(subscriptions)
    .values({
      userId: DEFAULT_USER_ID,
      name: name.trim(),
      vendor: vendor?.trim() || null,
      amount: amount ?? null,
      currency: (currency as typeof VALID_CURRENCIES[number]) ?? "CHF",
      frequency: (frequency as typeof VALID_FREQUENCIES[number]) ?? "monthly",
      nextDue: nextDue ? new Date(nextDue) : null,
      paymentMethod: paymentMethod?.trim() || null,
      notes: notes?.trim() || null,
      status: "active",
    })
    .returning();

  return NextResponse.json({ ok: true, subscription: created }, { status: 201 });
}
