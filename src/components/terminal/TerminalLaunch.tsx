"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Loader2, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { postJson } from "@/lib/api/fetch";
import type { BuilderChannel } from "@/lib/event-stream-types";
import type { TerminalLaunchProject } from "@/app/api/terminal/context/route";

/**
 * Start an agent from the empty terminal, in place.
 *
 * The empty state used to end in "go to Loki / go to Control" — the one page
 * whose whole job is the live session sent you elsewhere to create one. This
 * posts the same /api/agent/launch the Control launch modal uses, pinned to the
 * builder the user is currently looking at, so the session appears in the very
 * strip above this form within one poll.
 */

/** Dropdown picker — replaces cramped native <select> with design-system chrome. */
function Picker({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escHandler);
    };
  }, [open]);

  const selected = options.find((o) => o.id === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "ui-chip-toggle inline-flex items-center gap-1.5 px-3 py-1.5 text-xs",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        {selected?.label ?? value}
        <ChevronDown className="h-3 w-3" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 max-h-60 min-w-[160px] overflow-y-auto rounded-xl border border-border-default bg-surface-overlay py-1.5 shadow-card">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                onChange(option.id);
                setOpen(false);
              }}
              className={cn(
                "ui-tap block w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface-raised",
                option.id === value ? "text-accent-text font-medium" : "text-text-secondary",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TerminalLaunch({
  projects,
  agents,
  defaultAgent,
  channel,
}: {
  projects: TerminalLaunchProject[];
  agents: { id: string; label: string }[];
  defaultAgent: string | null;
  channel: BuilderChannel;
}) {
  const [projectName, setProjectName] = useState(projects[0]?.name ?? "");
  const [agentOverride, setAgentOverride] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [startedAs, setStartedAs] = useState<string | null>(null);

  const project = projects.find((p) => p.name === projectName) ?? null;
  // Per-project preference wins until the user explicitly picks an agent.
  const agentId =
    agentOverride ??
    (project?.agentPref && agents.some((a) => a.id === project.agentPref)
      ? project.agentPref
      : (defaultAgent ?? agents[0]?.id ?? ""));

  if (projects.length === 0 || agents.length === 0) return null;

  if (startedAs) {
    return (
      <p className="text-center text-xs text-text-muted">
        Starting {startedAs} in &ldquo;{projectName}&rdquo; — the session appears above when
        it&apos;s up.
      </p>
    );
  }

  const start = async () => {
    if (!project || !agentId) return;
    setBusy(true);
    setError("");
    try {
      await postJson("/api/agent/launch", {
        tab: project.name,
        dir: project.dir,
        agent: agentId,
        channel,
      });
      setStartedAs(agents.find((a) => a.id === agentId)?.label ?? agentId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Launch failed");
    } finally {
      setBusy(false);
    }
  };

  const projectOptions = projects.map((p) => ({ id: p.name, label: p.name }));
  const agentOptions = agents.map((a) => ({ id: a.id, label: a.label }));

  return (
    <div className="mt-2 flex flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Picker
          label="Project to start an agent in"
          value={projectName}
          options={projectOptions}
          onChange={setProjectName}
          disabled={busy}
        />
        <Picker
          label="Agent to start"
          value={agentId}
          options={agentOptions}
          onChange={setAgentOverride}
          disabled={busy}
        />
        <button
          type="button"
          className="ui-btn-primary"
          onClick={() => void start()}
          disabled={busy || !project || !agentId}
        >
          {busy ? <Loader2 className="ui-spinner" /> : <Play className="h-3.5 w-3.5" />}
          Start here
        </button>
      </div>
      {error && <p className="ui-error">{error}</p>}
    </div>
  );
}
