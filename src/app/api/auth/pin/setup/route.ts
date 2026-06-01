import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/password";
import { getSessionUserId } from "@/lib/session";

const PIN_MIN_LENGTH = 4;
const PIN_MAX_LENGTH = 12;

async function getCurrentHash(userId: string): Promise<string | null> {
  const rows = await db
    .select({ hash: users.privateZonePinHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0]?.hash?.trim() ?? null;
}

function validatePin(value: unknown): { ok: true; pin: string } | { ok: false; error: string } {
  const pin = String(value ?? "").trim();
  if (!pin) return { ok: false, error: "PIN required" };
  if (!/^\d+$/.test(pin)) return { ok: false, error: "PIN must be digits only" };
  if (pin.length < PIN_MIN_LENGTH || pin.length > PIN_MAX_LENGTH) {
    return { ok: false, error: `PIN must be ${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} digits` };
  }
  return { ok: true, pin };
}

/**
 * POST /api/auth/pin/setup — set the private-zone PIN for the current user.
 *
 * Body shape:
 *   { newPin: string, currentPin?: string }
 *
 * Rules:
 *   - When no PIN is set yet, `currentPin` is not required.
 *   - When a PIN is already set, `currentPin` must match before the new one
 *     takes effect (prevents a session-hijacked actor from replacing the PIN
 *     without knowing the original).
 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { newPin?: unknown; currentPin?: unknown };
  try {
    body = (await req.json()) as { newPin?: unknown; currentPin?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const newPinResult = validatePin(body.newPin);
  if (!newPinResult.ok) {
    return NextResponse.json({ ok: false, error: newPinResult.error }, { status: 400 });
  }

  const existing = await getCurrentHash(userId);
  if (existing) {
    const currentPin = String(body.currentPin ?? "").trim();
    if (!currentPin) {
      return NextResponse.json({ ok: false, error: "Current PIN required" }, { status: 400 });
    }
    const valid = await verifyPassword(currentPin, existing);
    if (!valid) {
      return NextResponse.json({ ok: false, error: "Current PIN is incorrect" }, { status: 401 });
    }
  }

  const newHash = await hashPassword(newPinResult.pin);
  await db
    .update(users)
    .set({ privateZonePinHash: newHash, privateZonePinSetAt: new Date() })
    .where(eq(users.id, userId));

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/auth/pin/setup — disable the PIN entirely.
 *
 * Body shape: { currentPin: string }
 *
 * Requires the current PIN — disabling is destructive (private data becomes
 * unprotected) and should never happen from session hijack alone.
 */
export async function DELETE(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await getCurrentHash(userId);
  if (!existing) {
    return NextResponse.json({ ok: true, alreadyDisabled: true });
  }

  let body: { currentPin?: unknown };
  try {
    body = (await req.json()) as { currentPin?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const currentPin = String(body.currentPin ?? "").trim();
  if (!currentPin) {
    return NextResponse.json({ ok: false, error: "Current PIN required" }, { status: 400 });
  }

  const valid = await verifyPassword(currentPin, existing);
  if (!valid) {
    return NextResponse.json({ ok: false, error: "Current PIN is incorrect" }, { status: 401 });
  }

  await db
    .update(users)
    .set({ privateZonePinHash: null, privateZonePinSetAt: null })
    .where(eq(users.id, userId));

  return NextResponse.json({ ok: true });
}
