import { NextRequest, NextResponse } from "next/server";
import { readIdParam, readJsonBody, jsonOk, jsonError, z } from "@/lib/api/route-helpers";
import { getSessionUserId } from "@/lib/session";
import { getActiveWidgetToken, upsertWidgetToken, revokeWidgetToken } from "@/db/queries/widget-tokens";
import { appUrl } from "@/lib/email";
import type { WidgetToken } from "@/db/schema";

/**
 * Owner management of a project's feedback-widget token: view the embed
 * snippet, create, update origins, rotate, revoke.
 * Same canonical-base-URL rule as the share route: build links from
 * appUrl(), never req.nextUrl.origin (behind Caddy that's the internal bind).
 */

const TokenBody = z.object({
  origins: z.array(z.string().url().max(200)).max(10).optional(),
  status: z.enum(["active", "paused"]).optional(),
  rotate: z.boolean().default(false),
});

function withSnippet(t: WidgetToken) {
  const base = appUrl().replace(/\/$/, "");
  return {
    ...t,
    snippet: `<script src="${base}/widget.js" data-fc-project="${t.token}" async></script>`,
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const token = await getActiveWidgetToken(userId, idOrResp);
  return jsonOk({ token: token ? withSnippet(token) : null });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const dataOrResp = await readJsonBody(req, TokenBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const token = await upsertWidgetToken(userId, idOrResp, {
    origins: dataOrResp.origins?.map((o) => new URL(o).origin),
    status: dataOrResp.status,
    rotate: dataOrResp.rotate,
  });
  if (!token) return jsonError("Project not found", 404);
  return jsonOk({ token: withSnippet(token) });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  await revokeWidgetToken(userId, idOrResp);
  return jsonOk();
}
