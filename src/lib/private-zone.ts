import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/** Matches client sessionStorage TTL in use-private-zone.ts */
export const PRIVATE_ZONE_TTL_MS = 30 * 60 * 1000;

export const PRIVATE_ZONE_COOKIE = "cockpit-pz";

export function isPrivateZoneConfigured(): boolean {
  return !!process.env.PRIVATE_ZONE_PIN_HASH?.trim();
}

function authSecret(): string | null {
  const secret = process.env.AUTH_SECRET?.trim();
  return secret || null;
}

function signPayload(userId: string, expiresAt: number): string {
  const secret = authSecret();
  if (!secret) throw new Error("AUTH_SECRET is required for private zone cookies");
  const payload = `${userId}:${expiresAt}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}:${sig}`;
}

export function createPrivateZoneCookieValue(userId: string): string {
  const expiresAt = Date.now() + PRIVATE_ZONE_TTL_MS;
  return signPayload(userId, expiresAt);
}

export function verifyPrivateZoneCookieValue(token: string, userId: string): boolean {
  if (!token || !userId) return false;
  const parts = token.split(":");
  if (parts.length !== 3) return false;
  const [cookieUserId, expRaw, sig] = parts;
  if (cookieUserId !== userId) return false;
  const expiresAt = Number(expRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  const secret = authSecret();
  if (!secret) return false;

  const expected = createHmac("sha256", secret)
    .update(`${cookieUserId}:${expiresAt}`)
    .digest("base64url");

  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function isPrivateZoneUnlocked(userId: string): Promise<boolean> {
  if (!isPrivateZoneConfigured()) return true;
  const jar = await cookies();
  const token = jar.get(PRIVATE_ZONE_COOKIE)?.value;
  if (!token) return false;
  return verifyPrivateZoneCookieValue(token, userId);
}

/** Server components: throws redirect is handled by returning false — caller decides. */
export async function requirePrivateZoneUnlocked(userId: string): Promise<boolean> {
  return isPrivateZoneUnlocked(userId);
}

/**
 * API routes for people / money / habits / events.
 * Returns a 403 NextResponse when PIN is required but missing/invalid.
 */
export async function guardPrivateZoneApi(userId: string): Promise<NextResponse | null> {
  if (!isPrivateZoneConfigured()) return null;
  if (await isPrivateZoneUnlocked(userId)) return null;
  return NextResponse.json(
    { error: "Private zone locked — enter your PIN first.", code: "private_zone_locked" },
    { status: 403 },
  );
}

export function privateZoneCookieOptions() {
  const secure = process.env.NODE_ENV === "production";
  return {
    httpOnly: true as const,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(PRIVATE_ZONE_TTL_MS / 1000),
  };
}
