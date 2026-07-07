// Client-side error reporter. Captures the React error-boundary digest +
// the user's current path so we can find the matching server log without
// asking the user to crack open DevTools. Kept generous on the input
// schema (no auth, no rate-limit per row) because the alternative is
// flying blind on production crashes.
//
// The matching server-side digest is persisted to the debug_logs table under
// the same value, so once we have the digest from the client we can pull the
// full stack from the DB (the host's logs are unreliable from our env).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logDebug } from "@/db/queries/debug-logs";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Unauthenticated by design (a crashing client may have no valid session), so
// cap per IP to stop a flood from growing debug_logs unbounded. Generous enough
// that a real crash-storm during an incident still gets recorded.
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

const Body = z.object({
  digest: z.string().max(200).optional(),
  message: z.string().max(2000).optional(),
  path: z.string().max(500).optional(),
  source: z.string().max(100).default("client-error-boundary"),
});

export async function POST(req: NextRequest) {
  if (!checkRateLimit(`debug-log:${getClientIp(req)}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return NextResponse.json({ ok: false, error: "rate limited" }, { status: 429 });
  }
  const raw = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "bad body" }, { status: 400 });
  }
  await logDebug({
    source: parsed.data.source,
    level: "error",
    message: parsed.data.message ?? "client-side error",
    meta: {
      digest: parsed.data.digest ?? null,
      path: parsed.data.path ?? null,
      userAgent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
    },
  }).catch(() => { /* never block error reporting on a logging failure */ });
  return NextResponse.json({ ok: true });
}
