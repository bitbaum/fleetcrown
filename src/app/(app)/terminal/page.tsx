import type { Metadata } from "next";
import { Info } from "lucide-react";
import { TerminalWorkspace } from "@/components/terminal/TerminalWorkspace";
import { isRuntimeAvailable } from "@/lib/runtime";

export const metadata: Metadata = { title: "Terminal" };

// These shells are PTYs spawned by the server that hosts FleetCrown (node-pty).
// When that server is the user's own machine (localhost / a local install)
// they're real local shells. On the hosted box they run ON THE BOX, not the
// user's machine — so be honest about it. The runner-hosted local terminal
// (shells over 127.0.0.1 from Fleet Runner) is the planned follow-up.
export default function TerminalPage() {
  const local = isRuntimeAvailable();
  return (
    <div className="app-page flex h-[calc(100dvh-2rem)] flex-col gap-4">
      <div className="ui-page-header">
        <div>
          <h1 className="ui-page-title">Terminal</h1>
          <p className="ui-page-subtitle">
            {local
              ? "Local shells on your machine — multi-tab, split into panes."
              : "Shells run on the FleetCrown server — multi-tab, split into panes."}
          </p>
        </div>
      </div>
      {!local && (
        <div className="ui-callout-warning">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" />
          <div className="text-sm leading-relaxed text-text-secondary">
            You&apos;re on the hosted app, so these shells run on the FleetCrown server — not your computer. To run agents on your
            machine, use <strong>Dispatch</strong> / <strong>Focus terminal</strong> on a project in Control (they drive your local
            Zellij via Fleet Runner). A terminal that runs real shells on your own machine is coming.
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1">
        <TerminalWorkspace />
      </div>
    </div>
  );
}
