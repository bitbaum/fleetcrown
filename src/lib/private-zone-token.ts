/**
 * The private-zone cookie FORMAT, on its own — no `next/headers`, no database.
 *
 * Split out of `private-zone.ts` so anything that cannot run inside a request
 * can still speak this format: the prod smoke and the UI dogfood need to reach
 * /people, /habits, /money and /events, and until now they could not.
 *
 * They could not because the suite believed a human-held PIN was the only way
 * in, so it skipped the private half of the app on every run — three probes and
 * two UI flows permanently "failed as skipped", which reads like coverage and
 * is not. The PIN was never the boundary: the unlock the server hands back is
 * an HMAC under AUTH_SECRET, and anyone holding AUTH_SECRET can already mint a
 * full session as any user. Minting this cookie from the same secret therefore
 * grants nothing new — it just stops a test suite pretending a third of the
 * product does not exist.
 *
 * The PIN still guards the thing it was built to guard: a person at the
 * keyboard, who does not have AUTH_SECRET.
 */
import { createHmac, timingSafeEqual } from "crypto";

import { PRIVATE_ZONE_COOKIE } from "@/config/brand-storage";
import { MINUTE_MS } from "@/lib/constants/time";

/** Matches client sessionStorage TTL in use-private-zone.ts */
export const PRIVATE_ZONE_TTL_MS = 30 * MINUTE_MS;

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

/** `name=value`, ready for a Cookie header. One place knows which name to use. */
export function privateZoneCookiePair(userId: string): string {
  return `${PRIVATE_ZONE_COOKIE}=${createPrivateZoneCookieValue(userId)}`;
}
