"use client";

import { useRef, useEffect } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type AgentEntry = { id: string; label: string };

export function AgentSwitcherPopover({
  agents,
  activeAgentId,
  onSwitch,
  onClose,
}: {
  agents: AgentEntry[];
  activeAgentId: string;
  onSwitch: (agentId: string | null) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const escHandler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escHandler);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-50 mt-1.5 min-w-[130px] rounded-xl border border-border-default bg-surface-overlay py-1.5 shadow-card"
    >
      <p className="px-3 pb-1 pt-0.5 text-micro uppercase tracking-wide text-text-muted">Switch agent</p>
      <p className="px-3 pb-1.5 text-[10px] leading-snug text-text-muted">Quits the current CLI and launches the new one — no /quit in terminal.</p>
      {agents.map((agent) => {
        const isActive = agent.id === activeAgentId;
        return (
          <button
            key={agent.id}
            type="button"
            onClick={(e) => { e.stopPropagation(); onSwitch(isActive ? null : agent.id); onClose(); }}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-surface-raised",
              isActive ? "text-accent-text" : "text-text-secondary",
            )}
          >
            {isActive && <Check className="h-3 w-3 shrink-0" />}
            <span className={isActive ? "font-medium" : "pl-5"}>{agent.label}</span>
          </button>
        );
      })}
    </div>
  );
}
