import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { enqueueInjectCommand } from "@/db/queries/pending-commands";
import { getApiUserId } from "@/lib/session";
import { isRuntimeAvailable } from "@/lib/runtime";
import { executor } from "@/lib/agent-execution";
import { workspaceIdFor } from "@/lib/agent-execution/ownership";

const Body = z.object({
  tab: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(4000),
});

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, Body);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { tab, prompt } = dataOrResp;

  // A FleetCrown-owned PTY agent is driven directly via the executor — no zellij.
  const wsId = workspaceIdFor(userId, tab);
  const wsHandle = isRuntimeAvailable() ? executor.get(wsId) : null;
  if (wsHandle && wsHandle.status !== "exited") {
    const { stateFile, clearHandshakeFiles } = await import("@/lib/agent-config");
    const fs = await import("fs");
    const nowS = Math.floor(Date.now() / 1000);
    fs.writeFileSync(stateFile.prompt(tab), JSON.stringify({
      key: "custom", label: prompt.slice(0, 40), startedAt: nowS, source: "inject", adapter: "unknown",
    }));
    clearHandshakeFiles(tab);
    executor.write(wsId, prompt.endsWith("\r") ? prompt : `${prompt}\r`);
    return NextResponse.json({ ok: true, mode: "pty", tab });
  }

  if (isRuntimeAvailable()) {
    const [{ injectIntoTab, isUserTypingInTab }, { stateFile, clearHandshakeFiles }, fs] = await Promise.all([
      import("@/lib/zellij"),
      import("@/lib/agent-config"),
      import("fs"),
    ]);
    if (isUserTypingInTab(tab)) {
      return NextResponse.json({ ok: true, blocked: true, reason: "user-typing", tab });
    }
    const nowS = Math.floor(Date.now() / 1000);
    fs.writeFileSync(stateFile.prompt(tab), JSON.stringify({
      key: "custom",
      label: prompt.slice(0, 40),
      startedAt: nowS,
      source: "inject",
      adapter: "unknown",
    }));
    clearHandshakeFiles(tab);
    injectIntoTab(tab, prompt);
    return NextResponse.json({ ok: true, mode: "direct", tab });
  }

  const commandId = await enqueueInjectCommand(userId, {
    tab,
    prompt,
    promptKey: "",
    promptLabel: prompt.slice(0, 40),
    adapter: "unknown",
  });
  return NextResponse.json({ ok: true, mode: "queued", commandId, tab });
}
