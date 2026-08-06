import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/session";
import { readJsonBody } from "@/lib/api/route-helpers";
import { saveSiteSnapshot, setProjectLiveUrl } from "@/db/queries/atlas";
import { probeSite } from "@/lib/atlas/probe";

const Body = z.object({
  projectId: z.string().uuid(),
  /** Empty string clears the URL — "this project has no site" is a real answer. */
  liveUrl: z.string().trim().max(1000),
});

export async function PATCH(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, Body);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const raw = dataOrResp.liveUrl;
  if (!raw) {
    const cleared = await setProjectLiveUrl(userId, dataOrResp.projectId, null);
    if (!cleared) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, liveUrl: null });
  }

  // Accept "kivvi.orangecat.ch" as readily as the full URL — typing https:// is
  // a tax on the person who already knows where their own site is.
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let normalized: string;
  try {
    normalized = new URL(candidate).toString();
  } catch {
    return NextResponse.json({ error: "Not a valid URL" }, { status: 400 });
  }

  const saved = await setProjectLiveUrl(userId, dataOrResp.projectId, normalized);
  if (!saved) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Probe immediately: a URL saved with no observation shows an empty card, and
  // the user has no way to tell "not checked yet" from "site is down".
  const probe = await probeSite(normalized);
  await saveSiteSnapshot(userId, dataOrResp.projectId, probe);

  return NextResponse.json({ ok: true, liveUrl: normalized, ok_status: probe.ok });
}
