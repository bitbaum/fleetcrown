"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ControlData, ProjectState } from "@/lib/control-types";
import type { FastProjectState } from "@/lib/control-fast-state";
import type { OrchestrationTaskIntentId } from "@/lib/orchestration";
import { getJson, postJson } from "@/lib/api/fetch";

type Agent = "codex" | "claude";
type AgentEntry = ControlData["agentRegistry"]["agents"][number];
type TabResult = { status: string; tab?: string; reason?: string; error?: string };
export type LaunchAgentOption = Pick<AgentEntry, "id" | "label" | "defaultModel" | "modelSuggestions" | "available" | "availabilityReason" | "capabilities">;

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
  refresh: (manual?: boolean) => Promise<void>;
  inject: (tab: string, promptKey?: string, customPrompt?: string) => Promise<void>;
  launchProject: (tab: string, dir: string, agent?: string, model?: string) => Promise<void>;
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

    poll();

    const onVisibilityChange = () => { if (!document.hidden) poll(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const id = setInterval(poll, 30_000);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh]);

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

  const inject = async (tab: string, promptKey?: string, customPrompt?: string) => {
    const res = await postJson("/api/inject", { tab, promptKey, customPrompt });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    setTimeout(refresh, 500);
  };

  const launchProject = async (tab: string, dir: string, agent?: string, model?: string) => {
    await postJson("/api/agent/launch", {
      tab,
      dir,
      agent: agent ?? selectedAgent,
      model,
    });
    setTimeout(() => refresh(true), 1500);
  };

  const runWithBrain = async (project: ProjectState, intent: OrchestrationTaskIntentId) => {
    setError(null);
    const res = await postJson("/api/orchestration/run", {
      projectKey: project.tab,
      projectPath: project.dir,
      adapter: data?.agentConfig.agent ?? "claude",
      intent,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    await refresh(true);
  };

  const runCustomPrompt = async (project: ProjectState, prompt: string, ag: string) => {
    if (!project.agentRunning) {
      await postJson("/api/agent/launch", { tab: project.tab, dir: project.dir, agent: ag });
      await new Promise((r) => setTimeout(r, 3000));
    }
    const res = await postJson("/api/orchestration/run", {
      projectKey: project.tab,
      projectPath: project.dir,
      adapter: ag,
      intent: "custom",
      customInstructions: prompt,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
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
    refresh, inject, launchProject,
    runWithBrain, runCustomPrompt, saveAgent,
    handleAgentSelect, handleModelChange, setError,
  };
}
