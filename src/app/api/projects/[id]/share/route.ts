import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/session";
import { readIdParam, readJsonBody } from "@/lib/api/route-helpers";
import { getActiveProjectShare, revokeProjectShare, upsertProjectShare } from "@/db/queries/project-shares";

const ShareBody = z.object({
  audience: z.enum(["advisor", "team", "public"]).default("advisor"),
  includeRoadmap: z.boolean().default(true),
  includeChangelog: z.boolean().default(true),
  includeResources: z.boolean().default(true),
  includeRepo: z.boolean().default(false),
  includeLiveUrl: z.boolean().default(true),
});

function shareUrl(req: NextRequest, token: string): string {
  return new URL(`/share/project/${token}`, req.nextUrl.origin).toString();
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const share = await getActiveProjectShare(userId, idOrResp);
  return NextResponse.json({
    ok: true,
    share: share ? { ...share, url: shareUrl(req, share.token) } : null,
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
  return NextResponse.json({ ok: true, share: { ...share, url: shareUrl(req, share.token) } });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  await revokeProjectShare(userId, idOrResp);
  return NextResponse.json({ ok: true });
}
