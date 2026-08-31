import { NextRequest, NextResponse } from "next/server";
import { z, readJsonBody } from "@/lib/api/route-helpers";
import { executor } from "@/lib/agent-execution";
import { ownsWorkspace } from "@/lib/agent-execution/ownership";
import { getApiUserId } from "@/lib/session";
import { decideWorkspaceAccess } from "@/lib/workspace-access";

export const runtime = "nodejs";

async function authorize(id: string): Promise<string | NextResponse> {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await decideWorkspaceAccess(userId);
  if (!access.ok)
    return NextResponse.json({ error: access.error, code: access.code }, { status: access.status });
  if (!ownsWorkspace(userId, id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return userId;
}

const ActionBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("input"), data: z.string().max(20000) }),
  z.object({
    action: z.literal("resize"),
    cols: z.number().int().positive().max(1000),
    rows: z.number().int().positive().max(500),
  }),
  z.object({ action: z.literal("terminate") }),
]);

/** GET /api/workspaces/[id] — current handle/status. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if (auth instanceof NextResponse) return auth;
  const handle = executor.get(id);
  if (!handle) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ workspace: handle });
}

/** POST /api/workspaces/[id] — write input / resize the PTY / terminate. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if (auth instanceof NextResponse) return auth;

  const data = await readJsonBody(req, ActionBody);
  if (data instanceof NextResponse) return data;

  switch (data.action) {
    case "input":
      executor.write(id, data.data);
      break;
    case "resize":
      executor.resize(id, data.cols, data.rows);
      break;
    case "terminate":
      await executor.terminate(id);
      break;
  }
  return NextResponse.json({ ok: true });
}
