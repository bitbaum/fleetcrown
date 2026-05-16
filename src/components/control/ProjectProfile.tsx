"use client";

import { useState, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFetch } from "@/hooks/use-fetch";
import { patchJson } from "@/lib/api/fetch";
import type { AgentPrompt } from "@/app/api/prompts/agent/route";
import type { ProjectState } from "@/lib/control-types";
import type { DevLogEntry, UserProject } from "@/db/schema/user-projects";
import {
  DIMENSION_META,
  MetaSection,
  DimensionSection,
} from "./project-profile-sections";
import {
  NotesSection,
  DevLogSection,
  RemoveSection,
  QuickProfileForm,
} from "./project-profile-helpers";

type AgentEntry = { id: string; label: string; modelSuggestions: string[] };
type AgentId = string;

export function ProjectProfile({
  project,
  globalAdapter,
  localAgent,
  availableAgents,
  onSetAgent,
  onRunPrompt,
  onDeleted,
  onProfileSaved,
}: {
  project: ProjectState;
  globalAdapter: string;
  localAgent: AgentId | null;
  availableAgents: AgentEntry[];
  onSetAgent: (agent: AgentId | null) => void;
  onRunPrompt: (prompt: string, agent: string) => Promise<void>;
  onDeleted?: () => void;
  onProfileSaved?: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [localModel, setLocalModel] = useState<string | null>(project.modelPref ?? null);
  const activeAgent = localAgent ?? (project.agentPref as AgentId | null) ?? (globalAdapter as AgentId);

  const persistAgentPref = (agentId: AgentId | null) => {
    if (project.id) {
      patchJson(`/api/user-projects/${project.id}`, { agentPref: agentId ?? undefined }).catch(() => {});
    }
    onSetAgent(agentId);
  };

  const persistModelPref = (model: string | null) => {
    setLocalModel(model);
    if (project.id) {
      patchJson(`/api/user-projects/${project.id}`, { modelPref: model ?? undefined }).catch(() => {});
    }
  };

  const { data: allPrompts } = useFetch<AgentPrompt[]>("/api/prompts/agent");
  const { data: userProject } = useFetch<UserProject>(project.id ? `/api/user-projects/${project.id}` : null);
  const devLogEntries = useMemo<DevLogEntry[]>(() => {
    if (!userProject?.devLog) return [];
    return [...userProject.devLog].reverse().slice(0, 12);
  }, [userProject]);

  const dimensionGroups = useMemo(() => {
    if (!allPrompts) return [];
    const byDim = new Map<string, AgentPrompt[]>();
    for (const p of allPrompts) {
      if (!p.dimensionId || p.style === "internal") continue;
      if (!byDim.has(p.dimensionId)) byDim.set(p.dimensionId, []);
      byDim.get(p.dimensionId)!.push(p);
    }
    return Object.keys(DIMENSION_META).filter((id) => byDim.has(id)).map((id) => ({
      id,
      prompts: byDim.get(id)!,
    }));
  }, [allPrompts]);

  const usageCounts = new Map<string, number>();
  for (const r of project.recentCustomPrompts) {
    usageCounts.set(r.customPrompt, r.count);
  }

  const handleRun = async (prompt: string) => {
    setSending(true);
    try {
      await onRunPrompt(prompt, activeAgent);
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      {/* Agent selector */}
      <div className="flex flex-col gap-3 border-t border-border-subtle px-4 py-3 sm:flex-row sm:items-center sm:px-5">
        <span className="ui-kicker shrink-0">Agent</span>
        <div className="flex flex-wrap gap-1.5">
          {availableAgents.map((a) => (
            <button
              key={a.id}
              onClick={() => persistAgentPref(localAgent === a.id ? null : a.id as AgentId)}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                activeAgent === a.id
                  ? "border-accent-primary/50 bg-accent-primary/10 text-accent-text"
                  : "border-border-subtle bg-surface-base text-text-tertiary hover:text-text-secondary hover:border-border-default"
              )}
            >
              {a.label}
              {a.id === globalAdapter && localAgent === null && (
                <span className="ml-1.5 opacity-40">✓</span>
              )}
            </button>
          ))}
        </div>
        {sending && <Loader2 className="ml-auto ui-spinner-sm text-text-muted" />}
      </div>

      {/* Model selector — shows suggestions for the active agent */}
      {(() => {
        const agentEntry = availableAgents.find((a) => a.id === activeAgent);
        const suggestions = agentEntry?.modelSuggestions ?? [];
        if (suggestions.length === 0) return null;
        const activeModel = localModel ?? suggestions[0];
        return (
          <div className="flex flex-col gap-3 border-t border-border-subtle px-4 py-3 sm:flex-row sm:items-center sm:px-5">
            <span className="ui-kicker shrink-0">Model</span>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((m) => (
                <button
                  key={m}
                  onClick={() => persistModelPref(m === suggestions[0] ? null : m)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                    activeModel === m
                      ? "border-accent-primary/50 bg-accent-primary/10 text-accent-text"
                      : "border-border-subtle bg-surface-base text-text-tertiary hover:text-text-secondary hover:border-border-default"
                  )}
                >
                  {m}
                  {m === suggestions[0] && <span className="ml-1.5 opacity-40">default</span>}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Project metadata */}
      {project.profile ? (
        <MetaSection profile={project.profile} />
      ) : project.projectId ? (
        <div className="border-t border-border-subtle">
          <div className="px-4 pt-3 sm:px-5">
            <p className="text-xs text-text-tertiary">
              No profile yet — add context so agents know what this project is about.
            </p>
          </div>
          <QuickProfileForm
            projectId={project.projectId}
            onSaved={() => onProfileSaved?.()}
          />
        </div>
      ) : (
        <div className="px-4 py-6 text-center sm:px-5">
          <p className="text-sm text-text-secondary">
            No profile — add metadata in the Projects view to enable full awareness.
          </p>
        </div>
      )}

      {/* Dimension prompt sections — loaded from ~/.config/agent-prompts.json */}
      {dimensionGroups.map(({ id, prompts }) => (
        <DimensionSection
          key={id}
          dimensionId={id}
          prompts={prompts}
          project={project}
          usageCounts={usageCounts}
          isSending={sending}
          onRun={handleRun}
        />
      ))}

      {/* Per-project notes / scratchpad */}
      {project.id && <NotesSection projectId={project.id} project={userProject} />}

      {/* Dev log — appended automatically when beacon sessions end */}
      {project.id && <DevLogSection entries={devLogEntries} />}

      {project.id && onDeleted && (
        <RemoveSection projectId={project.id} onRemoved={onDeleted} />
      )}
    </div>
  );
}
