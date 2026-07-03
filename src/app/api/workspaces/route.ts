import { homedir } from "node:os";
import { NextRequest, NextResponse } from "next/server";
import { z, readJsonBody } from "@/lib/api/route-helpers";
import { executor } from "@/lib/agent-execution";
import { workspaceIdFor } from "@/lib/agent-execution/ownership";
import { provisionAgentWorkspace } from "@/lib/agent-execution/launch";
import { isAgentId } from "@/lib/agent-registry";
import { getApiUserId } from "@/lib/session";
import { decideWorkspaceAccess } from "@/lib/workspace-access";

// node-pty (the LocalPtyExecutor) only runs in the Node runtime.
export const runtime = "nodejs";

const ProvisionBody = z.object({
  projectKey: z.string().trim().min(1).max(120),
  // Optional: a plain terminal opens in the user's home dir when omitted, so
  // the client (which can't know the server's $HOME) doesn't have to guess.
  cwd: z.string().trim().min(1).max(500).optional(),
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
  const access = await decideWorkspaceAccess(userId);
  if (!access.ok) return NextResponse.json({ error: access.error, code: access.code }, { status: access.status });

  const data = await readJsonBody(req, ProvisionBody);
  if (data instanceof NextResponse) return data;

  // Plain terminals omit cwd → open in $HOME. Agent launches always pass one.
  const cwd = data.cwd ?? homedir();

  // Agent launch → reuse the SSOT provision helper (shared with /api/agent/launch).
  if (data.agent) {
    if (!isAgentId(data.agent)) {
      return NextResponse.json({ error: `Unknown agent: ${data.agent}` }, { status: 400 });
    }
    const handle = await provisionAgentWorkspace(userId, {
      projectKey: data.projectKey,
      dir: cwd,
      agent: data.agent,
      model: data.model,
      cols: data.cols,
      rows: data.rows,
    });
    return NextResponse.json({ ok: true, workspace: handle });
  }

  // Plain shell (or explicit command) → provision directly.
  if (!data.command) {
    return NextResponse.json({ error: "Provide a command or an agent" }, { status: 400 });
  }
  const handle = await executor.provision({
    id: workspaceIdFor(userId, data.projectKey),
    cwd,
    command: data.command,
    args: data.args,
    cols: data.cols,
    rows: data.rows,
  });
  return NextResponse.json({ ok: true, workspace: handle });
}

/** GET /api/workspaces — list the caller's live workspaces. */
export async function GET() {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await decideWorkspaceAccess(userId);
  if (!access.ok) return NextResponse.json({ error: access.error, code: access.code }, { status: access.status });
  const prefix = `${userId}:`;
  const workspaces = executor.list().filter((w) => w.id.startsWith(prefix));
  return NextResponse.json({ workspaces });
}
