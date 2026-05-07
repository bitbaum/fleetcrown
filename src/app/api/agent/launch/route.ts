import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { launchAgentInTab } from "@/lib/agent-runtime";
import { listAgentRegistry } from "@/lib/agent-registry";

const LaunchAgentBody = z.object({
  tab: z.string().trim().min(1).max(120),
  dir: z.string().trim().min(1).max(500),
  agent: z.string().trim().min(1).max(40),
  model: z.string().trim().max(160).optional(),
});

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, LaunchAgentBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const { tab, dir, agent, model } = dataOrResp;
  const registry = listAgentRegistry();
  const exactEntry = registry.find((candidate) => candidate.id === agent);
  if (!exactEntry) {
    return NextResponse.json({ error: `Unknown agent: ${agent}` }, { status: 400 });
  }
  if (!exactEntry.available) {
    return NextResponse.json({ error: exactEntry.availabilityReason ?? `${exactEntry.label} is not available on this machine.` }, { status: 400 });
  }
  if (!exactEntry.capabilities.tabSwitching) {
    return NextResponse.json({ error: `${exactEntry.label} does not support launching into a development tab yet.` }, { status: 400 });
  }

  try {
    launchAgentInTab(tab, dir, exactEntry.id, model);
    return NextResponse.json({ ok: true, tab, agent: exactEntry.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Launch failed: ${message}` }, { status: 500 });
  }
}
