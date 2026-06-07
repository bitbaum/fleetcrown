"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ControlData, ProjectState } from "@/lib/control-types";
import type { FastProjectState } from "@/lib/control-fast-state";
import type { OrchestrationTaskIntentId } from "@/lib/orchestration";
import { getJson, postJson, throwApiError } from "@/lib/api/fetch";
import { REFRESH_AFTER_DISPATCH_MS, REFRESH_AFTER_LAUNCH_MS, AGENT_COLD_START_MS } from "@/lib/constants/timings";
import type { Agent } from "@/lib/agent-registry";
import { FLEETCROWN_REFRESH_EVENT } from "@/lib/client-events";
import { useEventStream } from "@/lib/event-stream";
type AgentEntry = ControlData["agentRegistry"]["agents"][number];
type TabResult = { status: string; tab?: string; reason?: string; error?: string };
export interface ControlDataHook {
  data: ControlData | null;
  lastUpdated: number | null;
  refreshing: boolean;
  error: string | null;
  selectedAgent: Agent;
  model: string;
  savedConfig: ControlData["agentConfig"] | null;
  switchableRegistry: AgentEntry[];
  activeDefinition: AgentEntry | null;
  selectedDefinition: AgentEntry | null;
  hasPendingChange: boolean;
  savingAgent: boolean;
  lastTabResults: TabResult[];
  lastTabResultsAt: number | null;
  runtimeAvailable: boolean;
  daemonLastPushedAt: string | null;
  refresh: (manual?: boolean) => Promise<void>;
  inject: (tab: string, promptKey?: string, customPrompt?: string) => Promise<{ mode: "direct" | "queued" }>;
  launchProject: (tab: string, dir: string, agent?: string, model?: string, initialPrompt?: string) => Promise<void>;
  runWithBrain: (project: ProjectState, intent: OrchestrationTaskIntentId) => Promise<void>;
  runCustomPrompt: (project: ProjectState, prompt: string, ag: string) => Promise<void>;
  saveAgent: (applyToOpenTabs: boolean) => Promise<void>;
  handleAgentSelect: (agentId: string, defaultModel: string | undefined) => void;
  handleModelChange: (value: string) => void;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

export function useControlData(): ControlDataHook {
  const [data, setData] = useState<ControlData | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agent, setAgent] = useState<Agent | "">("");
  const [draftModels, setDraftModels] = useState<Partial<Record<Agent, string>>>({});
  const [savingAgent, setSavingAgent] = useState(false);
  const [agentDirty, setAgentDirty] = useState(false);
  const [lastTabResults, setLastTabResults] = useState<TabResult[]>([]);
  const [lastTabResultsAt, setLastTabResultsAt] = useState<number | null>(null);
  const inFlight = useRef(false);

  const registry = data?.agentRegistry.agents ?? [];
  const switchableRegistry = registry.filter((entry) => entry.switchable);
  const defaultAgent = data?.agentRegistry.defaultAgent ?? switchableRegistry[0]?.id ?? "claude";
  const selectedAgent = (agent || data?.agentConfig.agent || defaultAgent) as Agent;
  const selectedDefinition = switchableRegistry.find((entry) => entry.id === selectedAgent) ?? null;
  const activeDefinition = switchableRegistry.find((entry) => entry.id === data?.agentConfig.agent) ?? null;
  const model = draftModels[selectedAgent] ?? data?.agentConfig.model ?? selectedDefinition?.defaultModel ?? "";
  const savedConfig = data?.agentConfig ?? null;
  const hasAgentChange = savedConfig ? selectedAgent !== savedConfig.agent : false;
  const hasModelChange = savedConfig ? model.trim() !== savedConfig.model : false;
  const hasPendingChange = hasAgentChange || hasModelChange;

  const refresh = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const payload = await getJson<ControlData>("/api/control");
      setData(payload);
      if (!agentDirty) {
        setAgent(payload.agentConfig.agent);
        setDraftModels({ [payload.agentConfig.agent]: payload.agentConfig.model });
      }
      setLastUpdated(Date.now());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      if (manual) setRefreshing(false);
    }
  }, [agentDirty]);

  useEffect(() => {
    const poll = async () => {
      if (document.hidden || inFlight.current) return;
      inFlight.current = true;
      await refresh();
      inFlight.current = false;
    };

    // Always fetch on mount — bypass visibility so background-opened tabs load data.
    inFlight.current = true;
    refresh().finally(() => { inFlight.current = false; });

    // Three triggers for refetch after mount, all event-driven — no setInterval:
    //   1. visibilitychange: tab comes back to foreground (covers backgrounded
    //      tabs whose SSE was throttled by the browser).
    //   2. FLEETCROWN_REFRESH_EVENT: pull-to-refresh, manual refresh button,
    //      and other surfaces that broadcast "the world might have changed."
    //   3. The bridge SSE useEventStream subscription below — fires on every
    //      Postgres NOTIFY for this user.
    // Plus the dedicated /api/control/stream EventSource further down, which
    // pushes projects-update patches directly into setData without a full
    // /api/control refetch. With both push paths active, polling on a timer
    // is paying for an outage that hasn't happened — delete it.
    const onVisibilityChange = () => { if (!document.hidden) poll(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const onFleetCrownRefresh = () => { poll(); };
    window.addEventListener(FLEETCROWN_REFRESH_EVENT, onFleetCrownRefresh);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener(FLEETCROWN_REFRESH_EVENT, onFleetCrownRefresh);
    };
  }, [refresh]);

  // Subscribe to the SSE bridge for live change events. Any event for the
  // user (project_states, runtime_snapshots, pending_commands, etc.)
  // triggers a coalesced refetch of /api/control. The bridge tells us
  // *something* changed; the cloud snapshot tells us *what* it now is.
  //
  // This is push-driven freshness without replacing the snapshot route's
  // role — the snapshot still owns the merged view. With the setInterval
  // baseline removed above, this and the /api/control/stream EventSource
  // below are the only refresh triggers between mount and tab visibility
  // changes.
  const eventCoalesce = useRef<NodeJS.Timeout | null>(null);
  const eventState = useEventStream({
    onChange: () => {
      // Coalesce bursts of events (a Run state machine often touches
      // 3-4 rows in succession) into a single refetch. 200ms is short
      // enough to feel instant and long enough to absorb a burst.
      if (eventCoalesce.current) clearTimeout(eventCoalesce.current);
      eventCoalesce.current = setTimeout(() => {
        eventCoalesce.current = null;
        if (!document.hidden && !inFlight.current) {
          inFlight.current = true;
          refresh().finally(() => { inFlight.current = false; });
        }
      }, 200);
    },
  });
  // Expose the live-mode indicator to consumers via a window-level event
  // for any small "live updates: on" badge that wants to render. Cheaper
  // than threading state through the existing hook's return shape, which
  // is already wide. Tabs that don't care about the mode just ignore it.
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("fleetcrown:event-stream-mode", { detail: eventState }));
    }
  }, [eventState]);

  const mergeProjectPatches = useCallback((patches: FastProjectState[]) => {
    setData((prev) => {
      if (!prev) return prev;
      const updated = prev.projects.map((p) => {
        const patch = patches.find((pp) => pp.tab === p.liveTab || pp.tab === p.tab);
        if (!patch) return p;
        return {
          ...p,
          agentRunning: patch.agentRunning,
          activeAgents: patch.activeAgents,
          session: patch.session,
          currentPrompt: patch.currentPrompt,
          readyAt: patch.readyAt,
          lockAt: patch.lockAt,
          closingAt: patch.closingAt,
          closedAt: patch.closedAt,
        };
      });
      // Sync zellijTabs from tabOpen patches so active/idle categorisation stays live
      // without waiting for the next full poll (30 s).
      let zellijTabs = prev.zellijTabs;
      for (const patch of patches) {
        const tab = patch.tab.toLowerCase();
        if (patch.tabOpen && !zellijTabs.some((t) => t.toLowerCase() === tab)) {
          zellijTabs = [...zellijTabs, patch.tab];
        } else if (!patch.tabOpen && zellijTabs.some((t) => t.toLowerCase() === tab)) {
          zellijTabs = zellijTabs.filter((t) => t.toLowerCase() !== tab);
        }
      }
      return { ...prev, projects: updated, zellijTabs };
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
        reconnectTimer = setTimeout(connect, 5_000);
      };
    };

    connect();
    return () => {
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [mergeProjectPatches]);

  useEffect(() => {
    if (!lastTabResultsAt) return;
    const id = setTimeout(() => {
      setLastTabResults([]);
      setLastTabResultsAt(null);
    }, 30_000);
    return () => clearTimeout(id);
  }, [lastTabResultsAt]);

  const inject = async (tab: string, promptKey?: string, customPrompt?: string): Promise<{ mode: "direct" | "queued" }> => {
    const res = await postJson("/api/inject", { tab, promptKey, customPrompt, adapter: data?.agentConfig.agent ?? selectedAgent });
    if (!res.ok) await throwApiError(res, `HTTP ${res.status}`);
    const body = await res.json().catch(() => ({}));
    setTimeout(refresh, REFRESH_AFTER_DISPATCH_MS);
    return { mode: body.mode === "queued" ? "queued" : "direct" };
  };

  const launchProject = async (tab: string, dir: string, agent?: string, model?: string, initialPrompt?: string) => {
    const res = await postJson("/api/agent/launch", {
      tab,
      dir,
      agent: agent ?? selectedAgent,
      model,
      initialPrompt: initialPrompt?.trim() || undefined,
    });
    if (!res.ok) await throwApiError(res, `HTTP ${res.status}`);
    setTimeout(() => refresh(true), REFRESH_AFTER_LAUNCH_MS);
  };

  const runWithBrain = async (project: ProjectState, intent: OrchestrationTaskIntentId) => {
    setError(null);
    let queue: string[] = [];
    try {
      const queueRes = await fetch(`/api/beacon/queue/${encodeURIComponent(project.tab)}`);
      if (queueRes.ok) {
        const stored = await queueRes.json() as { queue?: unknown };
        if (Array.isArray(stored.queue)) queue = stored.queue.filter((item): item is string => typeof item === "string");
      }
    } catch { /* queue context remains best-effort */ }
    const res = await postJson("/api/orchestration/run", {
      projectId: project.projectId,
      projectKey: project.tab,
      projectPath: project.dir,
      adapter: data?.agentConfig.agent ?? "claude",
      intent,
      queue,
    });
    if (!res.ok) await throwApiError(res, `HTTP ${res.status}`);
    await refresh(true);
  };

  const runCustomPrompt = async (project: ProjectState, prompt: string, ag: string) => {
    if (!project.agentRunning) {
      await postJson("/api/agent/launch", { tab: project.tab, dir: project.dir, agent: ag });
      await new Promise((r) => setTimeout(r, AGENT_COLD_START_MS));
    }
    const res = await postJson("/api/orchestration/run", {
      projectId: project.projectId,
      projectKey: project.tab,
      projectPath: project.dir,
      adapter: ag,
      intent: "custom",
      customInstructions: prompt,
    });
    if (!res.ok) await throwApiError(res, `HTTP ${res.status}`);
    await refresh(true);
  };

  const saveAgent = async (applyToOpenTabs: boolean) => {
    setSavingAgent(true);
    try {
      const res = await postJson("/api/control/agent", { agent: selectedAgent, model, applyToOpenTabs });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setAgentDirty(false);
      setLastTabResults(Array.isArray(body.tabResults) ? body.tabResults : []);
      setLastTabResultsAt(Array.isArray(body.tabResults) ? Date.now() : null);
      setDraftModels((current) => ({ ...current, [selectedAgent]: model }));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update brain");
    } finally {
      setSavingAgent(false);
    }
  };

  const handleAgentSelect = (agentId: string, defaultModel: string | undefined) => {
    const next = agentId as Agent;
    setAgentDirty(true);
    setAgent(next);
    setDraftModels((current) => ({
      ...current,
      [next]: current[next] ?? defaultModel ?? "",
    }));
  };

  const handleModelChange = (value: string) => {
    setAgentDirty(true);
    setDraftModels((current) => ({ ...current, [selectedAgent]: value }));
  };

  return {
    data, lastUpdated, refreshing, error,
    selectedAgent, model, savedConfig,
    switchableRegistry, activeDefinition, selectedDefinition,
    hasPendingChange, savingAgent, lastTabResults, lastTabResultsAt,
    runtimeAvailable: data?.runtimeAvailable ?? true,
    daemonLastPushedAt: data?.daemonLastPushedAt ?? null,
    refresh, inject, launchProject,
    runWithBrain, runCustomPrompt, saveAgent,
    handleAgentSelect, handleModelChange, setError,
  };
}
