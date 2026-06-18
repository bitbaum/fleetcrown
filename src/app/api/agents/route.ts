import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { listAgentRegistry } from "@/lib/agent-registry";
import { ORCHESTRATION_ADAPTER_IDS } from "@/lib/orchestration";

/**
 * Lean agent list for client pickers (the Loki composer model picker). Returns
 * only the static facts a picker needs — id, label, default + suggested models —
 * from the registry SSOT (listAgentRegistry).
 *
 * Filtered to dispatchable adapters (ORCHESTRATION_ADAPTER_IDS): the inject path
 * routes by adapter id, so offering a non-dispatchable agent (e.g. cursor) would
 * give the operator a choice the dispatch can't honor. Availability is NOT
 * filtered here — it's host-local, but the command runs on the user's own
 * Fleet Runner, which has the agents installed.
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dispatchable = new Set<string>(ORCHESTRATION_ADAPTER_IDS);
  const agents = listAgentRegistry()
    .filter((a) => dispatchable.has(a.id))
    .map((a) => ({
      id: a.id,
      label: a.label,
      defaultModel: a.defaultModel,
      modelSuggestions: a.modelSuggestions,
    }));

  return NextResponse.json({ agents });
}
