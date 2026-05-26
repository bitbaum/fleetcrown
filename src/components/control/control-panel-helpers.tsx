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
  onRequestInstall,
  onLaunchNew,
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
  onRequestInstall?: (agentId: string) => void;
  onLaunchNew?: () => void;
  headerRight?: React.ReactNode;
}) {
  const modelSuggestions = selectedDefinition?.modelSuggestions ?? [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="ui-kicker">Launch defaults</p>
          <div className="flex items-center gap-1.5 text-text-primary">
            <Bot className="h-3.5 w-3.5 shrink-0 text-accent-text" />
            <span className="text-sm font-semibold">
              {selectedDefinition?.label ?? getAdapterLabel(selectedAgent)}
            </span>
            <span className="text-xs text-text-tertiary">· {model || selectedDefinition?.defaultModel}</span>
          </div>
        </div>
        {headerRight && (
          <div className="flex shrink-0 items-center gap-1.5">{headerRight}</div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {switchableRegistry.map((entry) => {
          const isAvailable = entry.available ?? true;
          const isSelected = selectedAgent === entry.id;
          return (
            <div key={entry.id} className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => isAvailable && onAgentSelect(entry.id, entry.defaultModel)}
                disabled={!isAvailable}
                className={isSelected ? "ui-chip-toggle-active" : "ui-chip-toggle"}
                title={isAvailable ? entry.label : `${entry.label} — not installed`}
              >
                {entry.label}
                {!isAvailable && <span className="ml-1 text-[9px] opacity-60">(install)</span>}
              </button>
              {!isAvailable && onRequestInstall && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestInstall(entry.id);
                  }}
                  className="ui-btn-ghost ui-btn-xs text-[10px] px-1.5 py-0.5"
                  title={`Install ${entry.label} — opens a terminal tab with the installer`}
                >
                  Install
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-1.5">
          {/* Model suggestions come strictly from the registry for the selected agent.
              Chips are quick picks; the input allows any custom value (with datalist for convenience). */}
          <div className="flex flex-wrap gap-1 items-center">
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
          </div>
          <input
            list={`model-options-${selectedAgent}`}
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            className="ui-input min-w-0 text-sm py-1"
            placeholder={selectedDefinition?.defaultModel ?? "Model (or type custom)"}
          />
          <datalist id={`model-options-${selectedAgent}`}>
            {modelSuggestions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>

        <div className="flex flex-wrap items-start gap-2 lg:justify-end">
          {hasPendingChange ? (
            <>
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
            </>
          ) : (
            onLaunchNew && (
              <button
                onClick={onLaunchNew}
                className="ui-btn-primary"
                title={`Launch a new project using ${selectedDefinition?.label ?? selectedAgent} · ${model || selectedDefinition?.defaultModel}`}
              >
                New project
              </button>
            )
          )}
        </div>
      </div>

      {lastTabResults.length > 0 && (
        <div className="rounded-xl border border-border-subtle bg-surface-overlay px-3 py-1.5 text-[10px] text-text-tertiary">
          Last switch{lastTabResultsAt ? ` · ${timeAgo(lastTabResultsAt)}` : ""}:{" "}
          {lastTabResults.slice(0, 3).map((r, i) => (
            <span key={i}>{r.tab ? `${r.tab} ${r.status}` : r.status}{r.error ? ` (${r.error})` : ""}{i < Math.min(lastTabResults.length, 3) - 1 ? ", " : ""}</span>
          ))}
        </div>
      )}
    </div>
  );
}

