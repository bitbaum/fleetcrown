"use client";

import { useEffect, useState } from "react";
import { WorkspaceTerminal } from "@/components/control/WorkspaceTerminal";
import type { AgentLifecycle } from "@/lib/agent-execution/types";

type ViewStatus = AgentLifecycle | "provisioning" | "error";

/**
 * Live embedded terminal over a FleetCrown-OWNED PTY (LocalPtyExecutor) — no
 * zellij. Provisions a workspace, then streams it into xterm. Query params:
 *   ?project=<key>&dir=<cwd>&cmd=<command>&arg=<a>&arg=<b>
 * Defaults to a bash shell in the repo so the round-trip is verifiable with zero
 * external setup. This is the first real consumer of the agent-execution
 * platform; Control's "Open workspace" will point here next.
 */
export default function WorkspaceTerminalPage() {
  const [id, setId] = useState<string | null>(null);
  const [status, setStatus] = useState<ViewStatus>("provisioning");
  const [error, setError] = useState("");
  const [meta, setMeta] = useState<{ project: string; cmd: string; dir: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const projectKey = params.get("project") ?? "scratch";
    const cwd = params.get("dir") ?? "/home/g/dev/fleetcrown";
    const agent = params.get("agent");
    const model = params.get("model") ?? undefined;
    // With ?agent=, the server resolves the launch command; otherwise a raw cmd
    // (defaults to a bash shell so the page is verifiable with no agent set up).
    const command = agent ? undefined : (params.get("cmd") ?? "bash");
    const args = agent ? undefined : params.getAll("arg");

    (async () => {
      try {
        const res = await fetch("/api/workspaces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectKey, cwd, command, args, agent, model }),
        });
        const data = await res.json();
        setMeta({ project: projectKey, cmd: agent ?? [command, ...(args ?? [])].join(" "), dir: cwd });
        if (!res.ok) {
          setStatus("error");
          setError(data?.error ?? `provision failed (${res.status})`);
          return;
        }
        setId(data.workspace.id);
        setStatus(data.workspace.status as AgentLifecycle);
      } catch (e) {
        setStatus("error");
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  return (
    <div className="app-page flex h-[82vh] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="ui-page-title">Workspace terminal</h1>
        <span className="ui-badge">{status}</span>
        {meta && <span className="ui-micro-label">{meta.cmd} · {meta.dir}</span>}
      </div>
      {error && <p className="ui-error">{error}</p>}
      {id && (
        <div className="ui-panel flex-1 overflow-hidden p-2">
          <WorkspaceTerminal id={id} onStatus={setStatus} className="h-full w-full" />
        </div>
      )}
    </div>
  );
}
