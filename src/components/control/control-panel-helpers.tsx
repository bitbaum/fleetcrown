"use client";

import React from "react";
import { Plus, X, Loader2, Bot, ChevronUp, ChevronDown } from "lucide-react";
import { getIntentLabel, getAdapterLabel } from "@/config/control-intents";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/dates";
import { Modal } from "@/components/ui/modal";
import type { ControlData } from "@/lib/control-types";

type AgentEntry = ControlData["agentRegistry"]["agents"][number];
type ActivityItem = ControlData["recentActivity"][number];
type TabResult = { status: string; tab?: string; reason?: string; error?: string };

export function ActivityLogPanel({
  activities,
  open,
  onToggle,
}: {
  activities: ActivityItem[];
  open: boolean;
  onToggle: () => void;
}) {
  if (activities.length === 0) return null;
  return (
    <div className="space-y-3 border-t border-border-subtle pt-4">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 text-sm text-text-secondary transition-colors hover:text-text-primary"
      >
        <span className="ui-kicker">Recent activity</span>
        <span className="text-text-tertiary">({activities.length})</span>
        {open ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
      </button>
      {open && (
        <div className="space-y-2">
          {activities.slice(0, 20).map((item) => (
            <div key={item.id} className="ui-control-activity-item">
              <div className="flex items-center gap-2 text-sm">
                <span className="shrink-0 font-medium text-text-primary">{item.projectKey}</span>
                <span className="ml-auto shrink-0 text-xs text-text-tertiary">
                  {timeAgo(new Date(item.dispatchedAt).getTime())}
                </span>
              </div>
              <p
                className="mt-1 text-sm leading-relaxed text-text-secondary"
                title={item.customPrompt ?? getIntentLabel(item.intent ?? "")}
              >
                {item.customPrompt ? item.customPrompt.slice(0, 120) : getIntentLabel(item.intent ?? "")}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function BrainConfigPanel({
  selectedAgent,
  switchableRegistry,
  model,
  hasPendingChange,
  savingAgent,
  selectedDefinition,
  lastTabResults,
  lastTabResultsAt,
  onAgentSelect,
  onModelChange,
  onSave,
  headerRight,
}: {
  selectedAgent: string;
  switchableRegistry: AgentEntry[];
  model: string;
  hasPendingChange: boolean;
  savingAgent: boolean;
  selectedDefinition: AgentEntry | null;
  lastTabResults: TabResult[];
  lastTabResultsAt: number | null;
  onAgentSelect: (agentId: string, defaultModel: string | undefined) => void;
  onModelChange: (value: string) => void;
  onSave: (applyToOpenTabs: boolean) => void;
  headerRight?: React.ReactNode;
}) {
  const modelSuggestions = selectedDefinition?.modelSuggestions ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="ui-kicker">Default launch agent</p>
          <div className="flex items-center gap-2 text-text-primary">
            <Bot className="h-4 w-4 shrink-0 text-accent-text" />
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {selectedDefinition?.label ?? getAdapterLabel(selectedAgent)}
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
            Saved preference for new Control launches and continuation prompts. Live execution is shown per project below.
          </p>
        </div>
        {headerRight && <div className="shrink-0">{headerRight}</div>}
      </div>

      <div className="flex flex-wrap gap-2">
        {switchableRegistry.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => onAgentSelect(entry.id, entry.defaultModel)}
            className={selectedAgent === entry.id ? "ui-chip-toggle-active" : "ui-chip-toggle"}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-3">
          <input
            list={`model-options-${selectedAgent}`}
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            className="ui-input min-w-0"
            placeholder={selectedDefinition?.defaultModel ?? "Model"}
          />
          <datalist id={`model-options-${selectedAgent}`}>
            {modelSuggestions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
          <div className="flex flex-wrap gap-1.5">
            {modelSuggestions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onModelChange(option)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  model === option
                    ? "border-accent-primary bg-accent-muted text-text-primary"
                    : "border-border-subtle text-text-tertiary hover:text-text-secondary",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {hasPendingChange && (
          <div className="flex flex-wrap items-start gap-2 lg:justify-end">
            <button
              onClick={() => onSave(false)}
              disabled={savingAgent || !model.trim()}
              className="ui-btn-secondary"
            >
              Save
            </button>
            <button
              onClick={() => onSave(true)}
              disabled={savingAgent || !model.trim()}
              className="ui-btn-primary"
            >
              {savingAgent ? "…" : "Apply to open tabs"}
            </button>
          </div>
        )}
      </div>

      {lastTabResults.length > 0 && (
        <div className="rounded-2xl border border-border-subtle bg-surface-overlay px-4 py-3 text-xs text-text-tertiary">
          Last switch{lastTabResultsAt ? ` · ${timeAgo(lastTabResultsAt)}` : ""}:{" "}
          {lastTabResults.slice(0, 4).map((r, i) => (
            <span key={i}>{r.tab ? `${r.tab} ${r.status}` : r.status}{r.error ? ` (${r.error})` : ""}{i < Math.min(lastTabResults.length, 4) - 1 ? ", " : ""}</span>
          ))}
        </div>
      )}
    </div>
  );
}


export function NewProjectModal({
  name,
  dir,
  gitUrl,
  error,
  creating,
  onNameChange,
  onDirChange,
  onGitUrlChange,
  onCreate,
  onClose,
}: {
  name: string;
  dir: string;
  gitUrl: string;
  error: string;
  creating: boolean;
  onNameChange: (value: string) => void;
  onDirChange: (value: string) => void;
  onGitUrlChange: (value: string) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose} size="md">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-text-primary">New project</h3>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-3">
        <input
          autoFocus
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onCreate()}
          placeholder="Project name (= zellij tab)"
          className="ui-input w-full"
        />
        <input
          value={dir}
          onChange={(e) => onDirChange(e.target.value)}
          placeholder="Local path — e.g. /home/g/dev/homeharmony"
          className="ui-input w-full"
        />
        <input
          value={gitUrl}
          onChange={(e) => onGitUrlChange(e.target.value)}
          placeholder="Git URL — optional"
          className="ui-input w-full"
        />
      </div>
      {error && <p className="ui-error">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onCreate}
          disabled={creating || !name.trim()}
          className="ui-btn-primary flex-1 gap-1.5"
        >
          {creating ? <Loader2 className="ui-spinner-sm" /> : <Plus className="h-3.5 w-3.5" />}
          {dir.trim() ? "Create & launch" : "Create"}
        </button>
        <button onClick={onClose} className="ui-btn-secondary">
          Cancel
        </button>
      </div>
    </Modal>
  );
}

export function LaunchTabModal({
  tab,
  dir,
  agents,
  selectedAgentId,
  selectedModel,
  launching,
  error,
  onAgentChange,
  onModelChange,
  onLaunch,
  onClose,
}: {
  tab: string;
  dir: string;
  agents: AgentEntry[];
  selectedAgentId: string;
  selectedModel: string;
  launching: boolean;
  error: string;
  onAgentChange: (agentId: string) => void;
  onModelChange: (value: string) => void;
  onLaunch: () => void;
  onClose: () => void;
}) {
  const selected = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0] ?? null;
  const supportsModel = !!selected && selected.modelSuggestions.length > 0;

  return (
    <Modal onClose={onClose} size="md">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-text-primary">Launch development tab</h3>
          <p className="mt-1 text-sm text-text-tertiary">{tab} · {dir}</p>
        </div>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {agents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => onAgentChange(agent.id)}
              disabled={!agent.available}
              className={selectedAgentId === agent.id ? "ui-chip-toggle-active" : "ui-chip-toggle"}
              title={agent.available ? `${agent.label}` : (agent.availabilityReason ?? `${agent.label} unavailable`)}
            >
              {agent.label}
            </button>
          ))}
        </div>

        {selected && !selected.available && (
          <p className="text-sm text-status-warning">{selected.availabilityReason ?? `${selected.label} is unavailable on this machine.`}</p>
        )}

        {selected && supportsModel && (
          <div className="space-y-2">
            <input
              list={`launch-model-options-${selected.id}`}
              value={selectedModel}
              onChange={(e) => onModelChange(e.target.value)}
              className="ui-input w-full"
              placeholder={selected.defaultModel}
            />
            <datalist id={`launch-model-options-${selected.id}`}>
              {selected.modelSuggestions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <div className="flex flex-wrap gap-1.5">
              {selected.modelSuggestions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onModelChange(option)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    selectedModel === option
                      ? "border-accent-primary bg-accent-muted text-text-primary"
                      : "border-border-subtle text-text-tertiary hover:text-text-secondary",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && <p className="ui-error">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onLaunch}
          disabled={launching || !selected || !selected.available || (supportsModel && !selectedModel.trim())}
          className="ui-btn-primary flex-1 gap-1.5"
        >
          {launching ? <Loader2 className="ui-spinner-sm" /> : <Plus className="h-3.5 w-3.5" />}
          Launch
        </button>
        <button onClick={onClose} className="ui-btn-secondary">
          Cancel
        </button>
      </div>
    </Modal>
  );
}
