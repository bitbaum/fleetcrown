import type { NextRequest } from "next/server";

/**
 * In-memory sliding-window rate limiter.
 *
 * Works correctly for the local server deployment (single process, long-lived).
 * On serverless, each cold-start resets the window — still limits
 * rapid-fire attacks within a warm function lifetime.
 */
const store = new Map<string, number[]>();

/**
 * Returns true if the request is allowed, false if the bucket is full (→ 429).
 *
 * @param key      Unique bucket key, e.g. `"register:1.2.3.4"`
 * @param limit    Max hits allowed within the window
 * @param windowMs Rolling window length in milliseconds
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;

  const hits = (store.get(key) ?? []).filter((t) => t > cutoff);
  if (hits.length >= limit) return false;

  hits.push(now);
  store.set(key, hits);
  return true;
}

/** Extract the real client IP from Next.js request headers. */
export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}
