import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, unlinkSync } from "fs";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";

const Body = z.object({
  enabled: z.boolean(),
});

// Daemon-readable sentinel. agent-hook-bridge.sh:handle_stop can short-circuit
// the popup launch entirely while this file exists, so the user really doesn't
// see anything pop while they're away.
const SENTINEL = "/tmp/cockpit-sleep-mode";

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await readJsonBody(req, Body);
  if (body instanceof NextResponse) return body;

  try {
    if (body.enabled) writeFileSync(SENTINEL, "on", "utf8");
    else              unlinkSync(SENTINEL);
  } catch {
    // unlinkSync throws if file doesn't exist — harmless
  }
  return NextResponse.json({ ok: true });
}
