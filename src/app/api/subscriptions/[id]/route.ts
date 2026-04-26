import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { readIdParam } from "@/lib/api/route-helpers";
import { VALID_FREQUENCIES, VALID_CURRENCIES } from "@/config/subscriptions";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const id = idOrResp;

  const body = await req.json();
  const patch: Record<string, unknown> = {};

  if ("nextDue" in body) patch.nextDue = body.nextDue ? new Date(body.nextDue) : null;
  if ("amount" in body) patch.amount = body.amount != null ? Number(body.amount) : null;
  if ("notes" in body) patch.notes = body.notes ? String(body.notes).trim() : null;
  if ("status" in body) patch.status = body.status;
  if ("name" in body && body.name) patch.name = String(body.name).trim();
  if ("vendor" in body) patch.vendor = body.vendor ? String(body.vendor).trim() : null;
  if ("paymentMethod" in body) patch.paymentMethod = body.paymentMethod ? String(body.paymentMethod).trim() : null;
  if ("currency" in body) {
    if (!VALID_CURRENCIES.includes(body.currency)) {
      return NextResponse.json({ error: "Invalid currency" }, { status: 400 });
    }
    patch.currency = body.currency;
  }
  if ("frequency" in body) {
    if (!VALID_FREQUENCIES.includes(body.frequency)) {
      return NextResponse.json({ error: "Invalid frequency" }, { status: 400 });
    }
    patch.frequency = body.frequency;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  patch.updatedAt = new Date();

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
