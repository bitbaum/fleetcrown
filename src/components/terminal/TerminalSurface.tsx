"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { EXECUTOR_COPY } from "@/config/executor-copy";
import { TerminalWorkspace } from "./TerminalWorkspace";
import { LocalMachineView } from "./LocalMachineView";

type Source = "server" | "machine";

/**
 * Terminal page surface with a source toggle. **Cloud** = agents on the server
 * builder (box-runner / workspaces). **This computer** = desktop app agents.
 */
export function TerminalSurface({
  local,
  immersive = false,
  initialSource,
  initialTab,
}: {
  local: boolean;
  immersive?: boolean;
  initialSource?: Source;
  initialTab?: string | null;
}) {
  const [source, setSource] = useState<Source>(initialSource ?? "server");
  const t = EXECUTOR_COPY.terminal;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setSource("server")}
          className={source === "server" ? "ui-chip-toggle-active" : "ui-chip-toggle"}
        >
          {local ? t.cloudLabelLocalHost : t.cloudLabel}
        </button>
        <button
          type="button"
          onClick={() => setSource("machine")}
          className={source === "machine" ? "ui-chip-toggle-active" : "ui-chip-toggle"}
        >
          {t.thisComputerLabel}
        </button>
      </div>

      {source === "server" && !immersive && (
        <div className="ui-callout-warning">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" />
          <div className="text-sm leading-relaxed text-text-secondary">
            {t.cloudHelp}
          </div>
        </div>
      )}
      {source === "machine" && !immersive && (
        <p className="hidden text-xs leading-relaxed text-text-muted sm:block">
          {t.thisComputerHelp}
        </p>
      )}

      <div className="relative min-h-0 flex-1">
        <div className={cn("absolute inset-0", source !== "server" && "hidden")}>
          <TerminalWorkspace />
        </div>
        <div className={cn("absolute inset-0", source !== "machine" && "hidden")}>
          <LocalMachineView initialTab={initialTab} immersive={immersive} />
        </div>
      </div>
    </div>
  );
}
