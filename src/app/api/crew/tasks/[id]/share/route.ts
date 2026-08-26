import { NextRequest, NextResponse } from "next/server";
import { taskSharePath } from "@/config/crew";
import { isTaskShareError, revokeHumanTaskShare, shareHumanTask } from "@/db/queries/human-tasks";
import { jsonOk, readIdParam } from "@/lib/api/route-helpers";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";
import { appUrl } from "@/lib/email";

/** Absolute link built from the canonical public base URL — behind the proxy
 *  `req.nextUrl.origin` is the internal bind, which produced dead copy links
 *  on the project share panel before it was fixed the same way. */
function absoluteShareUrl(path: string): string {
  return `${appUrl().replace(/\/$/, "")}${path}`;
}

/**
 * Hand the assignment to the person it names. This is the only call in the
 * feature that reaches a human, so it is its own route rather than a status a
 * generic PATCH could set by accident.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  try {
    const task = await shareHumanTask(access.userId, idOrResp);
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return jsonOk({
      task,
      url: task.shareToken ? absoluteShareUrl(taskSharePath(task.shareToken)) : null,
    });
  } catch (e: unknown) {
    if (isTaskShareError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/** Un-send. The link dies; an assignment still waiting on an answer goes back to draft. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const task = await revokeHumanTaskShare(access.userId, idOrResp);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return jsonOk({ task });
}
