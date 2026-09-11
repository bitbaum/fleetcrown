import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { stateFile } from "@/lib/agent-config";
import { injectOwned, NoLiveSessionError } from "@/lib/agent-execution/owned";
import { getSessionUserId } from "@/lib/session";
import { getUserProjects } from "@/db/queries/user-projects";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { isRuntimeAvailable } from "@/lib/runtime";

const ClearBody = z.object({
  tab: z.string().min(1).max(80),
});

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Cloud mode owns no agent PTYs to clear. Returning a clear 503 lets the
  // caller react instead of a silent no-op.
  if (!isRuntimeAvailable()) {
    return NextResponse.json(
      { ok: false, reason: "runtime_offline", error: "Clear context requires the local runner" },
      { status: 503 },
    );
  }

  const dataOrResp = await readJsonBody(req, ClearBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { tab } = dataOrResp;

  const dbProjects = await getUserProjects(userId).catch(() => []);
  const dbMatch = dbProjects.find((p) => p.name.toLowerCase() === tab.toLowerCase());
  if (!dbMatch) {
    return NextResponse.json({ error: `Unknown tab: ${tab}` }, { status: 404 });
  }
  const canonical = dbMatch.name;

  try {
    injectOwned(userId, canonical, "/clear");
    // /clear is not a prompt — clear the running-prompt state so UI shows idle
    try {
      fs.unlinkSync(stateFile.prompt(canonical));
    } catch {
      /* already gone */
    }
  } catch (err) {
    if (err instanceof NoLiveSessionError) {
      return NextResponse.json({ error: err.message, code: "no-live-session" }, { status: 409 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Clear failed: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
