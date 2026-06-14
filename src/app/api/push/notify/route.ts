import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getApiUserId } from "@/lib/session";
import {
  listSubscriptionsForUser,
  pruneDeadEndpoints,
} from "@/db/queries/push-subscriptions";
import { configureWebPush, sendOne, isDeadStatus } from "@/lib/push";

export const dynamic = "force-dynamic";

const NotifyBody = z.object({
  tab:         z.string().trim().min(1).max(120),
  projectName: z.string().trim().min(1).max(120),
  next:        z.string().trim().max(240).optional(),
  kind:        z.enum(["stopped", "blocked"]).default("stopped"),
  title:       z.string().trim().max(120).optional(),
  body:        z.string().trim().max(240).optional(),
});

/**
 * POST — runner-auth (Bearer) endpoint that fans a Web Push notification to
 * every subscription belonging to the calling user. Fire-and-forget from the
 * Stop hook; the response is informational. Failed-410 endpoints are GC'd.
 *
 * Returns 503 when VAPID env vars are missing so the runner log can surface
 * the misconfiguration — the autopilot path (Stage 2) still works without
 * push; this endpoint is additive.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getApiUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const cfg = configureWebPush();
    if (!cfg.ok) {
      return NextResponse.json({ error: "Push not configured", detail: cfg.reason }, { status: 503 });
    }

    const json = await req.json().catch(() => null);
    const parsed = NotifyBody.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid notify payload", details: parsed.error.flatten() }, { status: 400 });
    }
    const { tab, projectName, next, kind, title, body } = parsed.data;

    const subs = await listSubscriptionsForUser(userId);
    if (subs.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, reason: "No subscriptions for this user." });
    }

    const payload = {
      title: title ?? defaultTitle(kind, projectName),
      body:  body  ?? defaultBody(kind, next),
      url:   `/control?focus=${encodeURIComponent(tab)}`,
      tag:   `cockpit:${tab}`,
    };

    const results = await Promise.all(subs.map((s) => sendOne(s, payload)));
    const dead = results.filter((r) => !r.ok && isDeadStatus(r.statusCode)).map((r) => r.endpoint);
    if (dead.length > 0) await pruneDeadEndpoints(dead);

    const sent  = results.filter((r) => r.ok).length;
    const errs  = results.filter((r) => !r.ok && !isDeadStatus(r.statusCode)).length;
    return NextResponse.json({ ok: true, sent, gc: dead.length, errors: errs });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Push notify failed";
    return NextResponse.json({ error: "Push notify failed", detail: message }, { status: 500 });
  }
}

function defaultTitle(kind: "stopped" | "blocked", project: string): string {
  return kind === "blocked"
    ? `${project} · needs you`
    : `${project} · ready`;
}

function defaultBody(kind: "stopped" | "blocked", next: string | undefined): string {
  const tail = next?.trim() ? ` — ${next.trim()}` : "";
  return kind === "blocked"
    ? `Agent paused, capacity or health issue${tail}`
    : `Agent ready for the next step${tail}`;
}
