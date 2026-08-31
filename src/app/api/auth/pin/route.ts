import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyPassword } from "@/lib/password";
import {
  createPrivateZoneCookieValue,
  getEffectivePinHash,
  isPrivateZoneConfigured,
  isPrivateZoneUnlocked,
  PRIVATE_ZONE_COOKIE,
  privateZoneCookieOptions,
} from "@/lib/private-zone";
import { LEGACY_PRIVATE_ZONE_COOKIE } from "@/config/brand-storage";
import { getSessionUserId } from "@/lib/session";

const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_ATTEMPTS;
}

/** GET /api/auth/pin — private-zone status for the current session. */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const configured = await isPrivateZoneConfigured(userId);
  const unlocked = configured ? await isPrivateZoneUnlocked(userId) : true;

  return NextResponse.json({ configured, unlocked });
}

/** POST /api/auth/pin — verify PIN and set httpOnly unlock cookie. */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const hash = await getEffectivePinHash(userId);
  if (!hash) {
    return NextResponse.json({ ok: true, unconfigured: true });
  }

  // Rate-limit by user, not IP — multi-user prod has many users behind the
  // same IPv6 prefix and shared egress addresses.
  if (isRateLimited(userId)) {
    return NextResponse.json({ ok: false, error: "Too many attempts" }, { status: 429 });
  }

  let pin: string;
  try {
    const body = (await req.json()) as { pin?: unknown };
    pin = String(body.pin ?? "").trim();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  if (!pin) {
    return NextResponse.json({ ok: false, error: "PIN required" }, { status: 400 });
  }

  const valid = await verifyPassword(pin, hash);
  if (!valid) {
    return NextResponse.json({ ok: false, error: "Incorrect PIN" }, { status: 401 });
  }

  const value = createPrivateZoneCookieValue(userId);
  const jar = await cookies();
  jar.set(PRIVATE_ZONE_COOKIE, value, privateZoneCookieOptions());

  return NextResponse.json({ ok: true });
}

/** DELETE /api/auth/pin — lock private zone (clear unlock cookie). */
export async function DELETE() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jar = await cookies();
  jar.delete(PRIVATE_ZONE_COOKIE);
  jar.delete(LEGACY_PRIVATE_ZONE_COOKIE);

  return NextResponse.json({ ok: true });
}
