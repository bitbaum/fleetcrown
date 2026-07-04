import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { PRIVATE_ZONE_COOKIE, LEGACY_PRIVATE_ZONE_COOKIE } from "@/config/brand-storage";

export { PRIVATE_ZONE_COOKIE } from "@/config/brand-storage";

/** Matches client sessionStorage TTL in use-private-zone.ts */
export const PRIVATE_ZONE_TTL_MS = 30 * 60 * 1000;

/**
 * Resolve the effective PIN hash for a user.
 *
 * Per-user hashes live on `users.private_zone_pin_hash` and are the canonical
 * source. The legacy `PRIVATE_ZONE_PIN_HASH` env var is honoured only when a
 * user has no PIN of their own — a transitional fallback so the founder's
 * existing env-managed PIN keeps working until they set one in-app. This is
 * deliberately deprecated; new users should set their PIN through Settings →
 * Privacy.
 *
 * `cache()` dedupes the DB lookup within a single request — important when
 * many components on Today / System all call into the gate helpers.
 */
export const getEffectivePinHash = cache(async (userId: string): Promise<string | null> => {
  const rows = await db
    .select({ hash: users.privateZonePinHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const userHash = rows[0]?.hash?.trim() ?? null;
  if (userHash) return userHash;
  const envHash = process.env.PRIVATE_ZONE_PIN_HASH?.trim();
  return envHash || null;
});

export async function isPrivateZoneConfigured(userId: string): Promise<boolean> {
  return Boolean(await getEffectivePinHash(userId));
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
  // No PIN configured → no gate, always "unlocked".
  if (!(await isPrivateZoneConfigured(userId))) return true;
  const jar = await cookies();
  const token =
    jar.get(PRIVATE_ZONE_COOKIE)?.value ??
    jar.get(LEGACY_PRIVATE_ZONE_COOKIE)?.value;
  if (!token) return false;
  return verifyPrivateZoneCookieValue(token, userId);
}

/**
 * Single-call helper for components that just need to know "should I hide
 * private data right now?" — returns true when the PIN is set AND the gate
 * is still locked. One DB hit per request thanks to React's cache().
 */
export async function isPrivateZoneLocked(userId: string): Promise<boolean> {
  if (!(await isPrivateZoneConfigured(userId))) return false;
  return !(await isPrivateZoneUnlocked(userId));
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
  if (!(await isPrivateZoneConfigured(userId))) return null;
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
