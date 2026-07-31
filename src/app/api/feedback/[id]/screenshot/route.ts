import { NextRequest, NextResponse } from "next/server";
import { readIdParam, jsonError } from "@/lib/api/route-helpers";
import { getSessionUserId } from "@/lib/session";
import { getFeedbackScreenshot } from "@/db/queries/site-feedback";

/**
 * The visitor-attached image for one feedback row, served as a real image
 * response. Kept out of the inbox list payload on purpose — the bytes load
 * only when the operator opens them. NOTE: /api/feedback is excluded from the
 * auth middleware (the public ingest lives there), so the session check below
 * is the ONLY gate on this handler — do not remove it.
 */

const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const dataUrl = await getFeedbackScreenshot(userId, idOrResp);
  const match = dataUrl ? DATA_URL_RE.exec(dataUrl) : null;
  if (!match) return jsonError("No screenshot", 404);

  const bytes = Buffer.from(match[2], "base64");
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": match[1],
      "Content-Length": String(bytes.length),
      // Owner-only, immutable per row — cache privately.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
