import { type NextRequest, NextResponse } from "next/server";

/**
 * SSOT auth gate for Vercel-Cron-targeted API routes.
 *
 * Behavior:
 *   - Production (VERCEL=1) + CRON_SECRET unset → 503 (fail-closed; never
 *     leave a janitor publicly callable because someone forgot the env var).
 *   - CRON_SECRET set → require Authorization: Bearer ${CRON_SECRET}, else 401.
 *   - Local dev (VERCEL unset + CRON_SECRET unset) → allow, so devs can curl
 *     a cron endpoint directly without env setup.
 *
 * Returns a NextResponse on failure (caller should `return` it) or `null`
 * on success (caller proceeds with the cron work).
 *
 * Usage:
 *   export async function GET(req: NextRequest) {
 *     const denied = requireCronAuth(req);
 *     if (denied) return denied;
 *     // ... do the work
 *   }
 *
 * Note on Vercel build validation: CRON_SECRET must contain no leading or
 * trailing whitespace (HTTP header values reject it). When setting via the
 * CLI, use `printf %s "$value" | vercel env add CRON_SECRET production`
 * instead of `echo` (which appends a newline).
 */
export function requireCronAuth(req: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  const isProd = !!process.env.VERCEL;

  if (isProd && !expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 },
    );
  }

  if (expected) {
    const header = req.headers.get("authorization");
    if (header !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return null;
}
