import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { stateFile } from "@/lib/agent-config";
import { injectIntoTab } from "@/lib/zellij";
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

  // Cloud mode has no zellij and no agent panes to clear. Before this guard
  // the call landed at injectIntoTab which threw a generic "zellij not found"
  // 500 that the UI didn't surface — silent no-op for the user. Returning
  // a clear 503 lets the caller (and any future caller) react properly.
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
    injectIntoTab(canonical, "/clear");
    // /clear is not a prompt — clear the running-prompt state so UI shows idle
    try {
      fs.unlinkSync(stateFile.prompt(canonical));
    } catch {
      /* already gone */
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Clear failed: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
