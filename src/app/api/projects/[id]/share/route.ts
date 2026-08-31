import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/session";
import { readIdParam, readJsonBody } from "@/lib/api/route-helpers";
import {
  getActiveProjectShare,
  revokeProjectShare,
  upsertProjectShare,
} from "@/db/queries/project-shares";
import { appUrl } from "@/lib/email";

const ShareBody = z.object({
  audience: z.enum(["advisor", "team", "public"]).default("advisor"),
  includeRoadmap: z.boolean().default(true),
  includeChangelog: z.boolean().default(true),
  includeResources: z.boolean().default(true),
  includeRepo: z.boolean().default(false),
  includeLiveUrl: z.boolean().default(true),
});

// Build the shared link from the canonical public base URL (NEXTAUTH_URL), NOT
// req.nextUrl.origin — behind Caddy the request origin is the internal bind
// (https://0.0.0.0:4002), which produced dead copy/open links in the share panel.
function shareUrl(token: string): string {
  return `${appUrl().replace(/\/$/, "")}/share/project/${token}`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const share = await getActiveProjectShare(userId, idOrResp);
  return NextResponse.json({
    ok: true,
    share: share ? { ...share, url: shareUrl(share.token) } : null,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const dataOrResp = await readJsonBody(req, ShareBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const share = await upsertProjectShare(userId, idOrResp, dataOrResp);
  if (!share) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, share: { ...share, url: shareUrl(share.token) } });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  await revokeProjectShare(userId, idOrResp);
  return NextResponse.json({ ok: true });
}
