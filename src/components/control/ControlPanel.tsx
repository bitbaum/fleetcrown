"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Bot, RefreshCw, Terminal, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/dates";
import { READY_WINDOW_S, CLOSED_WINDOW_S, CLOSING_WINDOW_S } from "@/lib/constants/control";
import type { ControlData, ProjectState } from "@/app/api/control/route";
import type { FastProjectState } from "@/lib/control-fast-state";
type Agent = "codex" | "claude";
import { ProjectCard } from "./ProjectCard";
import type { OrchestrationTaskIntentId } from "@/lib/orchestration";

export function ControlPanel() {
  const [data, setData] = useState<ControlData | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agent, setAgent] = useState<Agent | "">("");
  const [draftModels, setDraftModels] = useState<Partial<Record<Agent, string>>>({});
  const [savingAgent, setSavingAgent] = useState(false);
  const [agentDirty, setAgentDirty] = useState(false);
  const [lastTabResults, setLastTabResults] = useState<Array<{ status: string; tab?: string; reason?: string; error?: string }>>([]);
  const [lastTabResultsAt, setLastTabResultsAt] = useState<number | null>(null);
  const [brainOpen, setBrainOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const inFlight = useRef(false);

  const registry = data?.agentRegistry.agents ?? [];
  const switchableRegistry = registry.filter((entry) => entry.switchable);
  const defaultAgent = data?.agentRegistry.defaultAgent ?? switchableRegistry[0]?.id ?? "codex";
  const selectedAgent = (agent || data?.agentConfig.agent || defaultAgent) as Agent;
  const selectedDefinition = switchableRegistry.find((entry) => entry.id === selectedAgent) ?? null;
  const modelSuggestions = selectedDefinition?.modelSuggestions ?? [];
  const activeDefinition = switchableRegistry.find((entry) => entry.id === data?.agentConfig.agent) ?? null;
  const model = draftModels[selectedAgent] ?? data?.agentConfig.model ?? selectedDefinition?.defaultModel ?? "";
  const savedConfig = data?.agentConfig ?? null;
  const hasAgentChange = savedConfig ? selectedAgent !== savedConfig.agent : false;
  const hasModelChange = savedConfig ? model.trim() !== savedConfig.model : false;
  const hasPendingChange = hasAgentChange || hasModelChange;

  const refresh = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await fetch("/api/control");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json() as ControlData;
      setData(payload);
      if (!agentDirty) {
        setAgent(payload.agentConfig.agent);
        setDraftModels({
          [payload.agentConfig.agent]: payload.agentConfig.model,
        });
      }
      setLastUpdated(Date.now());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      if (manual) setRefreshing(false);
    }
  }, [agentDirty]);

  // Full data poll — every 30s for slow data (git, DB, profiles)
  useEffect(() => {
    const poll = async () => {
      if (document.hidden || inFlight.current) return;
      inFlight.current = true;
      await refresh();
      inFlight.current = false;
    };

    poll();

    const onVisibilityChange = () => { if (!document.hidden) poll(); };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const id = setInterval(poll, 30_000);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh]);

  // SSE fast-state subscription — merges agent/session/prompt state in ~2s
  const mergeProjectPatches = useCallback((patches: FastProjectState[]) => {
    setData((prev) => {
      if (!prev) return prev;
      const updated = prev.projects.map((p) => {
        const patch = patches.find((pp) => pp.tab === p.tab);
        if (!patch) return p;
        return {
          ...p,
          agentRunning: patch.agentRunning,
          session: patch.session,
          currentPrompt: patch.currentPrompt,
          readyAt: patch.readyAt,
          closingAt: patch.closingAt,
          closedAt: patch.closedAt,
        };
      });
      return { ...prev, projects: updated };
    });
    setLastUpdated(Date.now());
  }, []);

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      es = new EventSource("/api/control/stream");
      es.addEventListener("projects-update", (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data) as { projects: FastProjectState[] };
          mergeProjectPatches(payload.projects);
        } catch { /* ignore malformed events */ }
      });
      es.onerror = () => {
        es?.close();
        // Reconnect after 5s on error (don't hammer the server)
        reconnectTimer = setTimeout(connect, 5_000);
      };
    };

    connect();

    return () => {
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [mergeProjectPatches]);

  const inject = async (tab: string, promptKey?: string, customPrompt?: string) => {
    const res = await fetch("/api/inject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tab, promptKey, customPrompt }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    setTimeout(refresh, 500);
  };

  const runWithBrain = async (project: ControlData["projects"][number], intent: OrchestrationTaskIntentId) => {
    setError(null);
    const res = await fetch("/api/orchestration/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectKey: project.tab,
        projectPath: project.dir,
        adapter: data?.agentConfig.agent ?? "claude",
        intent,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    await refresh(true);
  };

  const runCustomPrompt = async (project: ProjectState, prompt: string, agent: string) => {
    if (!project.agentRunning) {
      await fetch("/api/agent/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab: project.tab, dir: project.dir, agent }),
      });
      await new Promise((r) => setTimeout(r, 3000));
    }
    const res = await fetch("/api/orchestration/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectKey: project.tab,
        projectPath: project.dir,
        adapter: agent,
        intent: "custom",
        customInstructions: prompt,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    await refresh(true);
  };

  const saveAgent = async (applyToOpenTabs: boolean) => {
    setSavingAgent(true);
    try {
      const res = await fetch("/api/control/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: selectedAgent, model, applyToOpenTabs }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setAgentDirty(false);
      setLastTabResults(Array.isArray(body.tabResults) ? body.tabResults : []);
      setLastTabResultsAt(Array.isArray(body.tabResults) ? Date.now() : null);
      setDraftModels((current) => ({
        ...current,
        [selectedAgent]: model,
      }));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update brain");
    } finally {
      setSavingAgent(false);
    }
  };

  useEffect(() => {
    if (!lastTabResultsAt) return;
    const id = setTimeout(() => {
      setLastTabResults([]);
      setLastTabResultsAt(null);
    }, 30_000);
    return () => clearTimeout(id);
  }, [lastTabResultsAt]);

  const nowS = Math.floor(Date.now() / 1000);
  const running = data?.projects.filter((p) => p.agentRunning).length ?? 0;
  const waitingCount = data?.projects.filter(
    (p) =>
      !p.agentRunning &&
      p.readyAt !== null &&
      nowS - p.readyAt < READY_WINDOW_S &&
      !(p.closedAt !== null && nowS - p.closedAt < CLOSED_WINDOW_S) &&
      !(p.closingAt !== null && nowS - p.closingAt < CLOSING_WINDOW_S)
  ).length ?? 0;
  const todayCommits = data?.projects.reduce((sum, p) => sum + (p.git?.todayCount ?? 0), 0) ?? 0;
  const total = data?.projects.length ?? 0;

  const sorted = data
    ? [...data.projects].sort((a, b) => {
        const nowS2 = Math.floor(Date.now() / 1000);
        const aReady  = !a.agentRunning && a.readyAt !== null && nowS2 - a.readyAt < READY_WINDOW_S;
        const bReady  = !b.agentRunning && b.readyAt !== null && nowS2 - b.readyAt < READY_WINDOW_S;
        const aClosed = a.closedAt !== null && nowS2 - a.closedAt < CLOSED_WINDOW_S;
        const bClosed = b.closedAt !== null && nowS2 - b.closedAt < CLOSED_WINDOW_S;
        if (aClosed && !bClosed) return -1;
        if (!aClosed && bClosed) return 1;
        if (aReady && !bReady) return -1;
        if (!aReady && bReady) return 1;
        if (a.agentRunning && !b.agentRunning) return -1;
        if (!a.agentRunning && b.agentRunning) return 1;
        const aActive = (a.git?.todayCount ?? 0) > 0;
        const bActive = (b.git?.todayCount ?? 0) > 0;
        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;
        return 0;
      })
    : null;

  return (
    <div className="space-y-5">
      <div className="ui-panel-raised space-y-5 p-5 md:p-7">
        {/* Stats — always visible */}
        <div className="ui-stat-grid">
          <div className="ui-stat-card">
            <div className="ui-stat-label">Active sessions</div>
            <div className="ui-stat-value">{running}</div>
          </div>
          <div className="ui-stat-card">
            <div className="ui-stat-label">Waiting</div>
            <div className="ui-stat-value">{waitingCount}</div>
          </div>
          <div className="ui-stat-card">
            <div className="ui-stat-label">Commits today</div>
            <div className="ui-stat-value">{todayCommits}</div>
          </div>
        </div>

        {/* Activity log — cross-project dispatch history */}
        {data?.recentActivity && data.recentActivity.length > 0 && (
          <div>
            <button
              onClick={() => setActivityOpen((v) => !v)}
              className="flex items-center gap-1 text-sm text-text-secondary transition-colors hover:text-text-primary"
            >
              Activity log <span className="ml-1 text-text-muted">({data.recentActivity.length})</span>
              {activityOpen ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
            </button>
            {activityOpen && (
              <div className="mt-2 space-y-1.5">
                {data.recentActivity.slice(0, 20).map((item) => (
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
        )}

        {/* Brain — collapsed pill + expandable form */}
        <div className="space-y-4">
          {/* Collapsed pill */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-accent-text" />
              <span className="text-text-primary font-medium">{activeDefinition?.label ?? selectedAgent}</span>
              <span className="text-text-muted">·</span>
              <span className="text-text-secondary text-sm">{savedConfig?.model ?? model}</span>
            </div>
            <button
              onClick={() => setBrainOpen((v) => !v)}
              className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Change {brainOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>

          {/* Expanded form */}
          {brainOpen && (
            <div className="space-y-4">
              <div>
                <div className="ui-kicker mb-2">Backend</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {switchableRegistry.map((entry) => {
                    const active = selectedAgent === entry.id;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => {
                          const next = entry.id as Agent;
                          setAgentDirty(true);
                          setAgent(next);
                          setDraftModels((current) => ({
                            ...current,
                            [next]: current[next] ?? entry.defaultModel ?? "",
                          }));
                        }}
                        className={cn(
                          "rounded-2xl border px-4 py-3 text-left transition",
                          active
                            ? "border-accent-primary bg-accent-muted"
                            : "border-border-subtle bg-surface-base hover:bg-surface-raised",
                        )}
                      >
                        <div className="font-medium text-text-primary">{entry.label}</div>
                        <div className="text-sm text-text-muted">Default: {entry.defaultModel}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <span className="ui-kicker">Model</span>
                <input
                  list={`model-options-${selectedAgent}`}
                  value={model}
                  onChange={(e) => {
                    setAgentDirty(true);
                    setDraftModels((current) => ({
                      ...current,
                      [selectedAgent]: e.target.value,
                    }));
                  }}
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
                      onClick={() => {
                        setAgentDirty(true);
                        setDraftModels((current) => ({ ...current, [selectedAgent]: option }));
                      }}
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
                  onClick={() => saveAgent(false)}
                  disabled={savingAgent || !model.trim() || !hasPendingChange}
                  className="rounded-2xl border border-border-default bg-surface-overlay px-4 py-3 text-base text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary disabled:opacity-40"
                >
                  Save as default
                </button>

                <button
                  onClick={() => saveAgent(true)}
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
                  <div className="mb-1 text-text-primary">Last tab switch result{lastTabResultsAt ? ` · ${timeAgo(lastTabResultsAt)}` : ""}</div>
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
                  Selected: <span className="text-text-primary">{selectedDefinition?.label ?? selectedAgent}</span> {model ? `· ${model}` : ""}
                </span>
                {savedConfig && (
                  <span className="rounded-full border border-border-subtle bg-surface-base px-3 py-1.5">
                    Saved default: <span className="text-text-primary">{savedConfig.agent}</span> · {savedConfig.model}
                  </span>
                )}
                {selectedDefinition?.defaultModel && (
                  <button
                    type="button"
                    onClick={() => {
                      setAgentDirty(true);
                      setDraftModels((current) => ({
                        ...current,
                        [selectedAgent]: selectedDefinition.defaultModel,
                      }));
                    }}
                    className="rounded-full border border-border-subtle bg-surface-base px-3 py-1.5 text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary"
                  >
                    Use detected default: {selectedDefinition.defaultModel}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
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
        <button
          onClick={() => refresh(true)}
          disabled={refreshing}
          className="flex items-center gap-1 self-start transition-colors hover:text-text-primary"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          Refresh
        </button>
      </div>

      {error && <p className="ui-box-error rounded-2xl px-4 py-3 text-sm">{error}</p>}

      {/* Zellij open tabs strip */}
      {data && data.zellijTabs.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Terminal className="h-4 w-4 text-text-muted shrink-0" />
          {data.zellijTabs.map((t) => {
            const hasProject = data.projects.some(
              (p) => p.tab.toLowerCase() === t.toLowerCase()
            );
            return (
              <span
                key={t}
                className={cn(
                "rounded-full px-2 py-1 font-mono text-[11px]",
                  hasProject ? "bg-surface-raised text-text-secondary" : "bg-surface-overlay text-text-muted"
                )}
              >
                {t}
              </span>
            );
          })}
        </div>
      )}

      {sorted ? (
        sorted.length > 0 ? (
          <div className="space-y-3">
            {sorted.map((project) => (
              <ProjectCard
                key={project.tab}
                project={project}
                prompts={data!.prompts}
                zellijTabs={data!.zellijTabs}

                currentAdapter={data?.agentConfig.agent ?? "claude"}
                onInject={inject}
                onRunWithBrain={async (projectState, intent) => {
                  try {
                    await runWithBrain(projectState, intent);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed to run task");
                  }
                }}
                onRunCustomPrompt={async (projectState, prompt, agent) => {
                  try {
                    await runCustomPrompt(projectState, prompt, agent);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed to run prompt");
                  }
                }}
              />
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-text-tertiary">
            No projects configured for the control panel
          </p>
        )
      ) : (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-[1.5rem] border border-border-subtle bg-surface-base" />
          ))}
        </div>
      )}
    </div>
  );
}
