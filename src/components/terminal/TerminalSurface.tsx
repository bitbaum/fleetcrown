"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { TerminalWorkspace } from "./TerminalWorkspace";
import { LocalMachineView } from "./LocalMachineView";

type Source = "server" | "machine";

/**
 * Terminal page surface with a source toggle. "This server" = PTYs the
 * FleetCrown server owns (TerminalWorkspace). "My machine" = live views of the
 * agents Fleet Runner is running on the user's machine (LocalMachineView, via
 * the peek stream). Same xterm view, two substrates — the doc's "terminal is a
 * view" made literal.
 */
export function TerminalSurface({ local }: { local: boolean }) {
  const [source, setSource] = useState<Source>("server");

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setSource("server")}
          className={source === "server" ? "ui-chip-toggle-active" : "ui-chip-toggle"}
        >
          {local ? "This machine (server)" : "This server"}
        </button>
        <button
          type="button"
          onClick={() => setSource("machine")}
          className={source === "machine" ? "ui-chip-toggle-active" : "ui-chip-toggle"}
        >
          My machine
        </button>
      </div>

      {source === "server" && !local && (
        <div className="ui-callout-warning">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" />
          <div className="text-sm leading-relaxed text-text-secondary">
            These shells run on the FleetCrown server — not your computer. Switch to{" "}
            <strong>My machine</strong> to watch the agents Fleet Runner is running on your machine.
          </div>
        </div>
      )}
      {source === "machine" && (
        <p className="text-xs leading-relaxed text-text-muted">
          Live view of the agents Fleet Runner runs on your machine. Pick a tab to watch it;
          &ldquo;Send a line&rdquo; types a prompt into it.
        </p>
      )}

      <div className="min-h-0 flex-1">
        {source === "server" ? <TerminalWorkspace /> : <LocalMachineView />}
      </div>
    </div>
  );
}
