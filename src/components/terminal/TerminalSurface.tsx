"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
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

      {/* Both substrates stay MOUNTED; the inactive one is hidden (not
          unmounted) so toggling This server ↔ My machine never tears down a
          live server PTY. Switching back reveals the same shell, not a fresh
          empty one. (Internal tabs already keep-alive the same way.) */}
      <div className="relative min-h-0 flex-1">
        <div className={cn("absolute inset-0", source !== "server" && "hidden")}>
          <TerminalWorkspace />
        </div>
        <div className={cn("absolute inset-0", source !== "machine" && "hidden")}>
          <LocalMachineView />
        </div>
      </div>
    </div>
  );
}
