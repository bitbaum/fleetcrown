import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";
import { isRuntimeAvailable } from "@/lib/runtime";
import { enqueueAutoContinueCommand } from "@/db/queries/pending-commands";
import { APP_SLUG } from "@/config/brand";
import { writeFileSync, unlinkSync } from "fs";

const Body = z.object({
  tab:     z.string().max(200),
  enabled: z.boolean(),
});

function sentinelPath(tab: string) {
  return `/tmp/${APP_SLUG}-auto-continue-${tab.toLowerCase()}`;
}

function applyLocalSentinel(tab: string, enabled: boolean) {
  if (enabled) {
    try { unlinkSync(sentinelPath(tab)); } catch { /* absent */ }
  } else {
    writeFileSync(sentinelPath(tab), "off", "utf8");
  }
}

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await readJsonBody(req, Body);
  if (body instanceof NextResponse) return body;
  const { tab, enabled } = body;

  if (isRuntimeAvailable()) {
    applyLocalSentinel(tab, enabled);
    return NextResponse.json({ ok: true, mode: "local" });
  }

  const commandId = await enqueueAutoContinueCommand(userId, { tab, enabled });
  return NextResponse.json({ ok: true, mode: "queued", commandId });
}
