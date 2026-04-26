import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { readIdParam, readJsonBody, z } from "@/lib/api/route-helpers";
import { VALID_FREQUENCIES, VALID_CURRENCIES } from "@/config/subscriptions";
import { SUB_STATUS } from "@/lib/constants/statuses";

const CURRENCIES_ENUM = VALID_CURRENCIES as readonly [string, ...string[]];
const FREQUENCIES_ENUM = VALID_FREQUENCIES as readonly [string, ...string[]];
const STATUSES = Object.values(SUB_STATUS) as [string, ...string[]];

const PatchSubscriptionBody = z
  .object({
    name: z.string().trim().min(1, "name cannot be empty").optional(),
    vendor: z.string().optional(),
    amount: z.number().nullable().optional(),
    currency: z.enum(CURRENCIES_ENUM, { error: "Invalid currency" }).optional(),
    frequency: z.enum(FREQUENCIES_ENUM, { error: "Invalid frequency" }).optional(),
    nextDue: z.string().nullable().optional(),
    paymentMethod: z.string().optional(),
    notes: z.string().optional(),
    status: z.enum(STATUSES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const id = idOrResp;

  const dataOrResp = await readJsonBody(req, PatchSubscriptionBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (dataOrResp.nextDue !== undefined) patch.nextDue = dataOrResp.nextDue ? new Date(dataOrResp.nextDue) : null;
  if (dataOrResp.amount !== undefined) patch.amount = dataOrResp.amount;
  if (dataOrResp.notes !== undefined) patch.notes = dataOrResp.notes.trim() || null;
  if (dataOrResp.status !== undefined) patch.status = dataOrResp.status;
  if (dataOrResp.name !== undefined) patch.name = dataOrResp.name;
  if (dataOrResp.vendor !== undefined) patch.vendor = dataOrResp.vendor.trim() || null;
  if (dataOrResp.paymentMethod !== undefined) patch.paymentMethod = dataOrResp.paymentMethod.trim() || null;
  if (dataOrResp.currency !== undefined) patch.currency = dataOrResp.currency;
  if (dataOrResp.frequency !== undefined) patch.frequency = dataOrResp.frequency;

  const [updated] = await db
    .update(subscriptions)
    .set(patch)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, DEFAULT_USER_ID)))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, subscription: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const id = idOrResp;

  const [deleted] = await db
    .delete(subscriptions)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, DEFAULT_USER_ID)))
    .returning({ id: subscriptions.id });

  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
