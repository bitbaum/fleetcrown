"use client";

import React from "react";
import { Bot, ChevronUp, ChevronDown } from "lucide-react";
import { getIntentLabel, getAdapterLabel } from "@/config/control-intents";
import { timeAgo } from "@/lib/dates";
import type { ControlData } from "@/lib/control-types";

type AgentEntry = ControlData["agentRegistry"]["agents"][number];
type ActivityItem = ControlData["recentActivity"][number];
type TabResult = { status: string; tab?: string; reason?: string; error?: string };

export function ControlMetricCard({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <div className="ui-control-metric-card">
      <div className="ui-control-metric-label">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="ui-control-metric-value">{value}</div>
      {note != null && <p className="ui-control-metric-note">{note}</p>}
    </div>
  );
}

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
          <p className="hidden sm:block max-w-2xl text-sm leading-relaxed text-text-secondary">
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
          {/* Hide the input when the value matches one of the chip suggestions
              — duplicating "sonnet" in both the input and the active chip read
              as a bug rather than a redundancy. When the user wants a model
              that isn't in the chip list, the input renders so they can edit
              their custom value. */}
          {!modelSuggestions.includes(model) && (
            <input
              list={`model-options-${selectedAgent}`}
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              className="ui-input min-w-0"
              placeholder={selectedDefinition?.defaultModel ?? "Model"}
            />
          )}
          <datalist id={`model-options-${selectedAgent}`}>
            {modelSuggestions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
          <div className="flex flex-wrap gap-1.5 items-center">
            {modelSuggestions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onModelChange(option)}
                className={model === option ? "ui-chip-toggle-compact-active" : "ui-chip-toggle-compact"}
              >
                {option}
              </button>
            ))}
            {/* Lets the user reveal the input to type a model name not in
                the suggestion list. Hidden when the input is already visible
                (i.e. model is already a custom value). */}
            {modelSuggestions.includes(model) && (
              <button
                type="button"
                onClick={() => onModelChange("")}
                className="ui-chip-toggle-compact"
                title="Type a custom model name"
              >
                Custom…
              </button>
            )}
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

