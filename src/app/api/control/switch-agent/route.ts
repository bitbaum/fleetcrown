import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { isRuntimeAvailable } from "@/lib/runtime";
import { listAgentRegistry, isAgentId, buildAgentOptionLaunchCommand } from "@/lib/agent-registry";
import { injectIntoTab, sendRawKey } from "@/lib/zellij";
import { getSessionUserId } from "@/lib/session";
import { enqueueSwitchAgentCommand } from "@/db/queries/pending-commands";

const SwitchAgentBody = z.object({
  tab:       z.string().trim().min(1).max(120),
  dir:       z.string().trim().min(1),
  toAgent:   z.string().trim().min(1),
  fromAgent: z.string().trim().optional(),
  model:     z.string().trim().optional(),
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Scan /proc to check whether any process matching the given basenames is
 * currently running with a cwd equal to or inside dir. Used to verify the
 * outgoing agent actually exited before we launch the replacement.
 */
function isAgentRunningInDir(processMatchers: string[], dir: string): boolean {
  try {
    for (const entry of fs.readdirSync("/proc")) {
      if (!/^\d+$/.test(entry)) continue;
      try {
        const cmdline = fs.readFileSync(`/proc/${entry}/cmdline`, "utf-8");
        const argv0 = cmdline.split("\0")[0] ?? "";
        const basename = argv0.includes("/") ? argv0.split("/").pop()! : argv0;
        if (!processMatchers.some((m) => basename === m || basename.startsWith(`${m}-`))) continue;
        const cwd = fs.readlinkSync(`/proc/${entry}/cwd`);
        if (cwd === dir || cwd.startsWith(dir + "/")) return true;
      } catch { /* process gone or permission denied */ }
    }
  } catch { /* /proc unavailable */ }
  return false;
}

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, SwitchAgentBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const { tab, dir, toAgent, fromAgent, model } = dataOrResp;

  if (!isAgentId(toAgent)) {
    return NextResponse.json({ error: `Unknown agent: ${toAgent}` }, { status: 400 });
  }

  // Cloud mode: enqueue for the local daemon to execute.
  if (!isRuntimeAvailable()) {
    const userId = await getSessionUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const commandId = await enqueueSwitchAgentCommand(userId, { tab, dir, toAgent, fromAgent, model });
    return NextResponse.json({ ok: true, queued: true, mode: "queued", commandId });
  }

  const registry = listAgentRegistry();

  try {
    // Step 1: quit the current agent if we know what it is.
    if (fromAgent && isAgentId(fromAgent) && fromAgent !== toAgent) {
      const fromEntry = registry.find((e) => e.id === fromAgent);
      if (fromEntry?.quitCommand) {
        injectIntoTab(tab, fromEntry.quitCommand);

        // Poll /proc for up to 2s to confirm the process exited cleanly.
        const deadline = Date.now() + 2000;
        let gone = false;
        while (Date.now() < deadline) {
          await sleep(200);
          if (!isAgentRunningInDir(fromEntry.processMatchers, dir)) {
            gone = true;
            break;
          }
        }

        // Quit command didn't land — agent is stuck on a prompt or permission
        // dialog. Send Ctrl+C as a harder interrupt and give it 600ms to clean up.
        if (!gone) {
          sendRawKey(tab, 3);
          await sleep(600);
        }
      }
    }

    // Step 2: launch the new agent.
    const launchCmd = buildAgentOptionLaunchCommand({ agent: toAgent, model }, dir);
    injectIntoTab(tab, launchCmd);

    return NextResponse.json({ ok: true, toAgent, fromAgent: fromAgent ?? null });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to switch agent" },
      { status: 500 },
    );
  }
}
