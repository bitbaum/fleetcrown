import { NextRequest, NextResponse } from "next/server";
import { z, readJsonBody } from "@/lib/api/route-helpers";
import { executor } from "@/lib/agent-execution";
import { workspaceIdFor } from "@/lib/agent-execution/ownership";
import { buildAgentOptionLaunchCommand, isAgentId } from "@/lib/agent-registry";
import { getApiUserId } from "@/lib/session";

// node-pty (the LocalPtyExecutor) only runs in the Node runtime.
export const runtime = "nodejs";

const ProvisionBody = z.object({
  projectKey: z.string().trim().min(1).max(120),
  cwd: z.string().trim().min(1).max(500),
  // Provide EITHER a raw command (e.g. "bash") OR an agent id (e.g. "claude").
  // With `agent`, we reuse the exact registry launch command the zellij path
  // uses (sources rc, cds, runs the agent CLI) inside the owned PTY's shell, so
  // PATH/env/model resolution match exactly.
  command: z.string().trim().min(1).max(60).optional(),
  args: z.array(z.string().max(200)).max(20).optional(),
  agent: z.string().trim().max(40).optional(),
  model: z.string().trim().max(160).optional(),
  cols: z.number().int().positive().max(1000).optional(),
  rows: z.number().int().positive().max(500).optional(),
});

/** POST /api/workspaces — provision (or re-attach to) a FleetCrown-owned agent PTY.
 *  Idempotent per (user, projectKey): re-provisioning a live workspace returns it. */
export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await readJsonBody(req, ProvisionBody);
  if (data instanceof NextResponse) return data;

  let command = data.command;
  let args = data.args;
  if (data.agent) {
    if (!isAgentId(data.agent)) {
      return NextResponse.json({ error: `Unknown agent: ${data.agent}` }, { status: 400 });
    }
    const launchCommand = buildAgentOptionLaunchCommand({ agent: data.agent, model: data.model }, data.cwd);
    command = "bash";
    args = ["-c", launchCommand];
  }
  if (!command) {
    return NextResponse.json({ error: "Provide a command or an agent" }, { status: 400 });
  }

  const id = workspaceIdFor(userId, data.projectKey);
  const handle = await executor.provision({
    id,
    cwd: data.cwd,
    command,
    args,
    cols: data.cols,
    rows: data.rows,
  });
  return NextResponse.json({ ok: true, workspace: handle });
}

/** GET /api/workspaces — list the caller's live workspaces. */
export async function GET() {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const prefix = `${userId}:`;
  const workspaces = executor.list().filter((w) => w.id.startsWith(prefix));
  return NextResponse.json({ workspaces });
}
