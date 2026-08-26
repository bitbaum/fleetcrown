import { NextRequest, NextResponse } from "next/server";
import { RespondToTaskBody } from "@/config/crew";
import {
  getSharedTask,
  isTaskTransitionError,
  respondToSharedTask,
} from "@/db/queries/human-tasks";
import { jsonOk, readJsonBody } from "@/lib/api/route-helpers";

/**
 * The assignee's endpoint. No session, no account — the token IS the credential.
 *
 * Two consequences, both deliberate:
 *   - every lookup is BY token, so a link can only ever answer for its own
 *     assignment, and a revoked one resolves to nothing at all;
 *   - the body accepts one of three actions and an optional note. There is no
 *     field here that can edit the ask, reassign it, or reach any other row.
 */

/** Tokens are 24 random bytes, base64url. Anything else is not worth a query. */
function isTokenShaped(token: string): boolean {
  return /^[A-Za-z0-9_-]{16,128}$/.test(token);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isTokenShaped(token)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const task = await getSharedTask(token);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return jsonOk({ task });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isTokenShaped(token)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const dataOrResp = await readJsonBody(req, RespondToTaskBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  try {
    const task = await respondToSharedTask(token, dataOrResp);
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return jsonOk({ task });
  } catch (e: unknown) {
    // The operator moved it while this page was open — say so rather than
    // silently overwriting an answer that is now out of date.
    if (isTaskTransitionError(e)) {
      return NextResponse.json(
        { error: "This assignment has moved on — reload to see where it stands." },
        { status: e.status },
      );
    }
    throw e;
  }
}
