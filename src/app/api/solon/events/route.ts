import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logDebug } from "@/db/queries/debug-logs";
import { verifySolonWebhookSignature } from "@/lib/integrations/solon-webhook";

/**
 * Solon event webhook — governance signals reaching the capability layer.
 *
 * v1 is a doorbell log only: FleetCrown has no Solon-governed artifact yet,
 * so a decision.finalized is recorded and acknowledged, nothing more. When a
 * governed artifact lands here, this receiver grows the same shape as
 * OrangeCat's decision edge: fetch the decision document, re-verify every
 * Bitcoin vote signature against locally pinned keys, only then act. Same
 * HMAC + fail-closed semantics as /api/orangecat/events.
 */
const Body = z.object({
  event: z.literal("decision.finalized"),
  event_id: z.string().trim().min(1).max(200),
  decision_id: z.string().uuid(),
  org_slug: z.string().trim().max(100),
  target: z.string().trim().max(200).nullable(),
  outcome: z.string().trim().max(40),
});

export async function POST(req: NextRequest) {
  const secret = process.env.SOLON_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "solon webhook not configured" }, { status: 503 });
  }

  const raw = await req.text();
  if (!verifySolonWebhookSignature(raw, req.headers.get("x-solon-signature"), secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    // Unknown-but-authentic events are acknowledged, not errored — Solon may
    // grow new event types without breaking this receiver.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const ev = parsed.data;
  await logDebug({
    source: "solon/events",
    level: "info",
    message: `Solon decision finalized: ${ev.decision_id} (${ev.outcome}) target=${ev.target ?? "none"}`,
    meta: { eventId: ev.event_id, orgSlug: ev.org_slug },
  }).catch(() => {});
  return NextResponse.json({ ok: true, recorded: true });
}
