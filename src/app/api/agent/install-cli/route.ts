import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getApiUserId } from "@/lib/session";
import { enqueuePendingCommand } from "@/db/queries/pending-commands";
import { listAgentRegistry } from "@/lib/agent-registry";
import { readJsonBody } from "@/lib/api/route-helpers";

const InstallCliBody = z.object({
  agent: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dataOrResp = await readJsonBody(req, InstallCliBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const { agent } = dataOrResp;

  const registry = listAgentRegistry();
  const entry = registry.find((e) => e.id === agent);
  if (!entry) {
    return NextResponse.json({ error: `Unknown agent: ${agent}` }, { status: 400 });
  }

  // Enqueue for the daemon to handle (it will open a tab + inject the installer)
  const commandId = await enqueuePendingCommand(userId, {
    type: "install_cli",
    payload: { agent },
  });

  return NextResponse.json({ ok: true, commandId, agent });
}