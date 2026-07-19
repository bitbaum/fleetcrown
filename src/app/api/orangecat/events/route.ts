import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { getUserProjectByOrangeCatProjectId } from "@/db/queries/user-projects";
import { createOrchestrationEventOnce } from "@/db/queries/orchestration-events";
import { logDebug } from "@/db/queries/debug-logs";

/**
 * OrangeCat event webhook — economic signals flowing back into the fleet.
 *
 * First event: payment.settled on a linked OC project → a "funding" event in
 * the project's activity timeline. Money that actually settled is the one
 * ground-truth signal agents can't game; surfacing it beside dispatches and
 * run outcomes is the capability layer seeing its anchor. Same HMAC secret
 * and fail-closed/idempotent semantics as /api/orangecat/entitlement.
 */
const Body = z.object({
  type: z.literal("payment.settled"),
  entityType: z.string().trim().max(40),
  entityId: z.string().uuid(),
  title: z.string().trim().max(300).optional(),
  amountBtc: z.string().trim().max(32).optional(),
  amountFiat: z.string().trim().max(32).optional(),
  currency: z.string().trim().max(8).optional(),
  externalId: z.string().trim().min(1).max(200),
});

function verifySignature(raw: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const got = header.startsWith("sha256=") ? header.slice(7) : header;
  const a = Buffer.from(got, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const secret = process.env.ORANGECAT_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "events webhook not configured" }, { status: 503 });
  }

  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-orangecat-signature"), secret)) {
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
    return NextResponse.json({ error: "invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const ev = parsed.data;

  try {
    const project = await getUserProjectByOrangeCatProjectId(ev.entityId);
    if (!project) {
      // Settled payment on an OC entity no FC project links to — fine, most OC
      // commerce has nothing to do with the fleet. 200 so OC never retries.
      return NextResponse.json({ ok: true, recorded: false, reason: "no-linked-project" });
    }

    const amount = ev.amountBtc
      ? `${ev.amountBtc} BTC`
      : ev.amountFiat
        ? `${ev.amountFiat} ${ev.currency ?? ""}`.trim()
        : "payment";
    const created = await createOrchestrationEventOnce(
      {
        userId: project.userId,
        projectId: project.entityProjectId,
        projectKey: project.name,
        eventType: "funding",
        source: "orangecat",
        detail: `Funding settled on OrangeCat: ${amount}${ev.title ? ` — ${ev.title}` : ""}`,
        happenedAt: new Date(),
      },
      `oc-payment-${ev.externalId}`,
    );
    if (created) {
      await logDebug({
        source: "orangecat/events",
        level: "info",
        message: `funding event recorded for ${project.name}`,
        meta: { externalId: ev.externalId, entityId: ev.entityId, amount },
      }).catch(() => {});
    }
    return NextResponse.json({ ok: true, recorded: Boolean(created), deduped: !created });
  } catch (err) {
    console.error("[orangecat/events] failed:", (err as Error).message);
    return NextResponse.json({ error: "event processing failed" }, { status: 500 });
  }
}
