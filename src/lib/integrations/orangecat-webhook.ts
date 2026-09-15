import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { z, ZodType } from "zod";

/**
 * Shared HMAC verification for the OrangeCat → Loki webhook rail.
 *
 * Both receivers (/api/orangecat/entitlement and /api/orangecat/events) verify
 * the exact same way: OrangeCat signs the raw request body with the shared
 * ORANGECAT_WEBHOOK_SECRET (HMAC-SHA256) and sends it as `x-orangecat-signature`.
 * The OrangeCat emitter formats the header as `sha256=<hex>`; a bare `<hex>` is
 * also accepted for forward-compatibility. Comparison is timing-safe.
 *
 * This is the single source of truth for that check — previously the identical
 * function was copy-pasted into both route files, so a change to one could
 * silently drift from the other.
 */
export function verifyOrangeCatWebhookSignature(
  raw: string,
  header: string | null,
  secret: string,
): boolean {
  if (!header) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const got = header.startsWith("sha256=") ? header.slice(7) : header;
  let a: Buffer;
  try {
    a = Buffer.from(got, "hex");
  } catch {
    return false;
  }
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The whole front door of an OrangeCat receiver: refuse if unconfigured,
 * verify the signature over the RAW body, then parse and validate it.
 *
 * All three receivers did these four steps identically — and the order is the
 * load-bearing part, not the code. The signature is computed over the bytes, so
 * it has to be checked before anything parses them; and the secret is checked
 * before that, because with no secret an unsigned request and a signed one are
 * the same request. A fourth receiver that reassembled this by hand is exactly
 * how one door ends up parsing first.
 *
 * Returns the validated body, or the NextResponse to send — the shape
 * lib/api/route-helpers already uses, so callers read the same as every other
 * route here.
 */
export async function readSignedOrangeCatBody<S extends ZodType>(
  req: NextRequest,
  schema: S,
  unconfiguredError: string,
): Promise<z.infer<S> | NextResponse> {
  const secret = process.env.ORANGECAT_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: unconfiguredError }, { status: 503 });
  }

  const raw = await req.text();
  if (!verifyOrangeCatWebhookSignature(raw, req.headers.get("x-orangecat-signature"), secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  return parsed.data as z.infer<S>;
}
