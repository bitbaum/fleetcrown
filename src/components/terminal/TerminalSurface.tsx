"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { EXECUTOR_COPY } from "@/config/executor-copy";
import { deriveExecutorHonestyLabel } from "@/lib/executor-honesty";
import { ExecutorHonestyChip } from "@/components/executor/ExecutorHonestyChip";
import { useBuilderPresence } from "@/hooks/use-builder-presence";
import { BuilderAgentView } from "./BuilderAgentView";
import { TerminalWorkspace } from "./TerminalWorkspace";
import { LocalMachineView } from "./LocalMachineView";

type Source = "server" | "machine";

/**
 * Terminal page surface with a source toggle. **Cloud** = agents on the box-runner
 * (peek stream + interactive rawkey on prod). **This computer** = desktop app agents.
 * Both are full xterm sessions — click to focus and type (Cursor-style).
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
  const builderPresence = useBuilderPresence();
  const cloudHonesty = deriveExecutorHonestyLabel({
    runnerConnected: builderPresence.runnerConnected,
    runtimeAvailable: local || builderPresence.runtimeAvailable,
  });
  const machineHonesty = deriveExecutorHonestyLabel({
    runnerConnected: builderPresence.builderPresence?.local ?? builderPresence.runnerConnected,
    runtimeAvailable: false,
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
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
        <ExecutorHonestyChip
          honesty={source === "server" ? cloudHonesty : machineHonesty}
        />
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
          {local ? (
            <TerminalWorkspace />
          ) : (
            <BuilderAgentView variant="cloud" initialTab={initialTab} immersive={immersive} />
          )}
        </div>
        <div className={cn("absolute inset-0", source !== "machine" && "hidden")}>
          <LocalMachineView initialTab={initialTab} immersive={immersive} />
        </div>
      </div>
    </div>
  );
}
