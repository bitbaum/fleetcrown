import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { jsonOk, jsonError, readJsonBody } from "@/lib/api/route-helpers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { subscribeToNewsletter } from "@/db/queries/newsletter-subscribers";

// Public (pre-auth) endpoint — excluded from the auth middleware in
// src/proxy.ts. Capture only: no confirmation email, no sending pipeline.
// Idempotent by design, so the response never leaks whether an address
// was already subscribed.

const SubscribeBody = z.object({
  email: z.string().trim().email().max(254),
  // Capture surface: "thoughts-index" or an essay slug.
  source: z.string().trim().min(1).max(120),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!checkRateLimit(`newsletter:${ip}`, 5, 60_000)) {
    return jsonError("Too many requests — try again in a minute", 429);
  }

  const dataOrResp = await readJsonBody(req, SubscribeBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  await subscribeToNewsletter(dataOrResp.email, dataOrResp.source);
  return jsonOk({ subscribed: true });
}
