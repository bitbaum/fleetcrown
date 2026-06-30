import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { enqueueInjectCommand, enqueueDispatchCommand } from "@/db/queries/pending-commands";
import { getUserProjects } from "@/db/queries/user-projects";
import { getApiUserId } from "@/lib/session";
import { isRuntimeAvailable } from "@/lib/runtime";
import { executor } from "@/lib/agent-execution";
import { workspaceIdFor } from "@/lib/agent-execution/ownership";
import { assembleInjectPrompt } from "@/lib/inject-prompt";
import {
  DEFAULT_ADAPTER_ID,
  ORCHESTRATION_ADAPTER_IDS,
  type AdapterId,
} from "@/lib/orchestration";

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
  const projects = await getUserProjects(userId);
  const project = projects.find((p) => p.name.toLowerCase() === tab.toLowerCase());
  const adapter: AdapterId =
    project?.agentPref && (ORCHESTRATION_ADAPTER_IDS as readonly string[]).includes(project.agentPref)
      ? project.agentPref as AdapterId
      : DEFAULT_ADAPTER_ID;
  const assembled = project?.dirPath
    ? await assembleInjectPrompt({
        userId,
        projectKey: project.name,
        projectPath: project.dirPath,
        projectId: project.entityProjectId ?? null,
        adapter,
        customPrompt: prompt,
        model: project.modelPref ?? undefined,
      })
    : null;
  const promptToSend = assembled?.ok ? assembled.prompt : prompt;
  const promptLabel = assembled?.ok ? assembled.promptLabel : prompt.slice(0, 40);

  // A FleetCrown-owned PTY agent is driven directly via the executor — no zellij.
  const wsId = workspaceIdFor(userId, tab);
  const wsHandle = isRuntimeAvailable() ? executor.get(wsId) : null;
  if (wsHandle && wsHandle.status !== "exited") {
    const { stateFile, clearHandshakeFiles } = await import("@/lib/agent-config");
    const fs = await import("fs");
    const nowS = Math.floor(Date.now() / 1000);
    fs.writeFileSync(stateFile.prompt(tab), JSON.stringify({
      key: "custom", label: promptLabel, startedAt: nowS, source: "inject", adapter,
    }));
    clearHandshakeFiles(tab);
    executor.write(wsId, promptToSend.endsWith("\r") ? promptToSend : `${promptToSend}\r`);
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
      label: promptLabel,
      startedAt: nowS,
      source: "inject",
      adapter,
    }));
    clearHandshakeFiles(tab);
    injectIntoTab(tab, promptToSend);
    return NextResponse.json({ ok: true, mode: "direct", tab });
  }

  // Cloud mode: prefer the self-healing `dispatch` command (ensure tab → launch
  // agent if none is running → inject → verify) over a bare `inject`, which
  // silently no-ops — and surfaces "tab not found" — when the tab's agent has
  // exited or its zellij tab vanished. That no-op was the failure that broke the
  // loop. Resolve the project's dir + agent so the runner can recover the tab.
  // Fall back to bare inject only when the project/dir is unknown.
  if (project?.dirPath) {
    const commandId = await enqueueDispatchCommand(userId, {
      tab,
      dir: project.dirPath,
      agent: adapter,
      prompt: promptToSend,
      promptLabel,
      model: project.modelPref ?? undefined,
      projectKey: tab,
    });
    return NextResponse.json({ ok: true, mode: "dispatch", commandId, tab });
  }

  const commandId = await enqueueInjectCommand(userId, {
    tab,
    prompt: promptToSend,
    promptKey: "",
    promptLabel,
    adapter,
  });
  return NextResponse.json({ ok: true, mode: "queued", commandId, tab });
}
