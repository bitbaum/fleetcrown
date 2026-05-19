import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, unlinkSync } from "fs";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";
import { APP_SLUG } from "@/config/brand";

const Body = z.object({
  tab:     z.string().max(200),
  enabled: z.boolean(),
});

// Sentinel file read by the beacon hook bridge on init so it respects the
// web-app pause state even when the app server is not running at popup open time.
function sentinelPath(tab: string) {
  return `/tmp/${APP_SLUG}-auto-continue-${tab.toLowerCase()}`;
}

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await readJsonBody(req, Body);
  if (body instanceof NextResponse) return body;
  const { tab, enabled } = body;
  try {
    if (enabled) {
      unlinkSync(sentinelPath(tab));
    } else {
      writeFileSync(sentinelPath(tab), "off", "utf8");
    }
  } catch {
    // unlinkSync throws if file doesn't exist — harmless
  }
  return NextResponse.json({ ok: true });
}
