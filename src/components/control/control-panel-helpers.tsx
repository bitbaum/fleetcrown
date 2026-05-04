"use client";

import { Plus, X, Loader2, Bot, ChevronUp, ChevronDown, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/dates";
import { Modal } from "@/components/ui/modal";
import type { ControlData } from "@/app/api/control/route";

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
    <div>
      <button
        onClick={onToggle}
        className="flex items-center gap-1 text-sm text-text-secondary transition-colors hover:text-text-primary"
      >
        Activity log <span className="ml-1 text-text-muted">({activities.length})</span>
        {open ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {activities.slice(0, 20).map((item) => (
            <div key={item.id} className="flex items-baseline gap-2 text-sm">
              <span className="shrink-0 font-medium text-text-primary">{item.projectKey}</span>
              <span className="text-text-muted">·</span>
              <span className="truncate text-text-secondary">
                {item.customPrompt ? item.customPrompt.slice(0, 60) : item.intent}
              </span>
              <span className="ml-auto shrink-0 text-text-muted">{timeAgo(new Date(item.dispatchedAt).getTime())}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function BrainConfigPanel({
  brainOpen,
  onToggle,
  selectedAgent,
  switchableRegistry,
  model,
  savedConfig,
  hasPendingChange,
  savingAgent,
  activeDefinition,
  selectedDefinition,
  lastTabResults,
  lastTabResultsAt,
  onAgentSelect,
  onModelChange,
  onSave,
}: {
  brainOpen: boolean;
  onToggle: () => void;
  selectedAgent: string;
  switchableRegistry: AgentEntry[];
  model: string;
  savedConfig: { agent: string; model: string } | null;
  hasPendingChange: boolean;
  savingAgent: boolean;
  activeDefinition: AgentEntry | null;
  selectedDefinition: AgentEntry | null;
  lastTabResults: TabResult[];
  lastTabResultsAt: number | null;
  onAgentSelect: (agentId: string, defaultModel: string | undefined) => void;
  onModelChange: (value: string) => void;
  onSave: (applyToOpenTabs: boolean) => void;
}) {
  const modelSuggestions = selectedDefinition?.modelSuggestions ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-accent-text" />
          <span className="text-text-primary font-medium">{activeDefinition?.label ?? selectedAgent}</span>
          <span className="text-text-muted">·</span>
          <span className="text-text-secondary text-sm">{savedConfig?.model ?? model}</span>
        </div>
        <button
          onClick={onToggle}
          className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          Change {brainOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {brainOpen && (
        <div className="space-y-4">
          <div>
            <div className="ui-kicker mb-2">Backend</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {switchableRegistry.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onAgentSelect(entry.id, entry.defaultModel)}
                  className={cn(
                    "rounded-2xl border px-4 py-3 text-left transition",
                    selectedAgent === entry.id
                      ? "border-accent-primary bg-accent-muted"
                      : "border-border-subtle bg-surface-base hover:bg-surface-raised",
                  )}
                >
                  <div className="font-medium text-text-primary">{entry.label}</div>
                  <div className="text-sm text-text-muted">Default: {entry.defaultModel}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="ui-kicker">Model</span>
            <input
              list={`model-options-${selectedAgent}`}
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              className="ui-input"
              placeholder={selectedDefinition?.defaultModel ?? "Model name"}
            />
            <datalist id={`model-options-${selectedAgent}`}>
              {modelSuggestions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <div className="flex flex-wrap gap-2">
              {modelSuggestions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onModelChange(option)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm",
                    model === option
                      ? "border-accent-primary bg-accent-muted text-text-primary"
                      : "border-border-subtle bg-surface-base text-text-secondary hover:bg-surface-raised",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              onClick={() => onSave(false)}
              disabled={savingAgent || !model.trim() || !hasPendingChange}
              className="rounded-2xl border border-border-default bg-surface-overlay px-4 py-3 text-base text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary disabled:opacity-40"
            >
              Save as default
            </button>
            <button
              onClick={() => onSave(true)}
              disabled={savingAgent || !model.trim() || !hasPendingChange}
              className="rounded-2xl bg-accent-primary px-4 py-3 text-base text-text-inverted transition-colors hover:bg-accent-hover disabled:opacity-40"
            >
              {savingAgent ? "Switching…" : "Apply + restart open tabs"}
            </button>
          </div>

          <p className="max-w-3xl text-base text-text-secondary">
            Save Default only affects future launches. Switch Open Tabs restarts the currently open project tabs in Zellij with the selected backend and model.
          </p>

          {lastTabResults.length > 0 && (
            <div className="rounded-2xl border border-border-subtle bg-surface-base px-4 py-3 text-sm text-text-secondary">
              <div className="mb-1 text-text-primary">
                Last tab switch result{lastTabResultsAt ? ` · ${timeAgo(lastTabResultsAt)}` : ""}
              </div>
              <ul className="space-y-1">
                {lastTabResults.slice(0, 8).map((result, idx) => (
                  <li key={`${result.tab ?? "global"}-${idx}`}>
                    {result.status.toUpperCase()} {result.tab ? `· ${result.tab}` : ""}
                    {result.reason ? ` — ${result.reason}` : ""}
                    {result.error ? ` — ${result.error}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {activeDefinition && (
            <div className="rounded-2xl border border-border-subtle bg-surface-base px-4 py-3 text-sm text-text-secondary">
              <span className="text-text-primary">{activeDefinition.label}</span>
              {activeDefinition.capabilities.sessionLifecycleSignals
                ? " supports the full loop — lifecycle hooks, ready signals, and autonomous continuation."
                : " dispatches tasks via prompt injection. No stop/ready lifecycle signals — banners trigger from orchestration run completions only."}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
            <span className="rounded-full border border-border-subtle bg-surface-overlay px-3 py-1.5">
              Selected: <span className="text-text-primary">{selectedDefinition?.label ?? selectedAgent}</span>
              {model ? ` · ${model}` : ""}
            </span>
            {savedConfig && (
              <span className="rounded-full border border-border-subtle bg-surface-base px-3 py-1.5">
                Saved default: <span className="text-text-primary">{savedConfig.agent}</span> · {savedConfig.model}
              </span>
            )}
            {selectedDefinition?.defaultModel && (
              <button
                type="button"
                onClick={() => onModelChange(selectedDefinition!.defaultModel)}
                className="rounded-full border border-border-subtle bg-surface-base px-3 py-1.5 text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary"
              >
                Use detected default: {selectedDefinition.defaultModel}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function FleetStatusBar({
  running,
  waitingCount,
  todayCommits,
  total,
  lastUpdated,
  selectedAgent,
  refreshing,
  onNewProject,
  onRefresh,
}: {
  running: number;
  waitingCount: number;
  todayCommits: number;
  total: number;
  lastUpdated: number | null;
  selectedAgent: string;
  refreshing: boolean;
  onNewProject: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm text-text-tertiary">
      <span>
        {total > 0 ? (
          <>
            {running > 0 && <span className="text-accent-text">{running} {selectedAgent} sessions running</span>}
            {running > 0 && (waitingCount > 0 || todayCommits > 0) && " · "}
            {waitingCount > 0 && <span className="text-status-positive">{waitingCount} waiting</span>}
            {waitingCount > 0 && todayCommits > 0 && " · "}
            {todayCommits > 0 && <span>+{todayCommits} commits today</span>}
            {running === 0 && waitingCount === 0 && todayCommits === 0 && `${total} projects`}
          </>
        ) : "Loading…"}
        {lastUpdated && ` · ${timeAgo(lastUpdated)}`}
      </span>
      <div className="flex items-center gap-3 self-start">
        <button
          onClick={onNewProject}
          className="flex items-center gap-1 transition-colors hover:text-text-primary"
        >
          <Plus className="h-4 w-4" />
          New project
        </button>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-1 transition-colors hover:text-text-primary"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          Refresh
        </button>
      </div>
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
      {error && <p className="text-sm text-status-negative">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onCreate}
          disabled={creating || !name.trim()}
          className="ui-btn-primary flex-1 gap-1.5"
        >
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          {dir.trim() ? "Create & launch" : "Create"}
        </button>
        <button onClick={onClose} className="ui-btn-secondary">
          Cancel
        </button>
      </div>
    </Modal>
  );
}
