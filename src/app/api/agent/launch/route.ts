import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { launchAgentInTab } from "@/lib/agent-runtime";

const LaunchAgentBody = z.object({
  tab: z.string().trim().min(1).max(120),
  dir: z.string().trim().min(1).max(500),
  agent: z.enum(["claude", "codex"]),
  model: z.string().trim().max(160).optional(),
});

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, LaunchAgentBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const { tab, dir, agent, model } = dataOrResp;
  try {
    launchAgentInTab(tab, dir, agent, model);
    return NextResponse.json({ ok: true, tab, agent });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Launch failed: ${message}` }, { status: 500 });
  }
}
