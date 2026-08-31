"use client";

import { useState } from "react";
import { patchJson } from "@/lib/api/fetch";
import type { ControlData, ProjectState } from "@/lib/control-types";

type AgentEntry = ControlData["agentRegistry"]["agents"][number];

interface LaunchTarget {
  id: string | null;
  tab: string;
  dir: string;
}

export function useLaunchModal({
  launchableAgents,
  selectedAgent,
  setError,
  launchProject,
}: {
  launchableAgents: AgentEntry[];
  selectedAgent: string;
  setError: (e: string) => void;
  launchProject: (
    tab: string,
    dir: string,
    agent?: string,
    model?: string,
    initialPrompt?: string,
  ) => Promise<void>;
}) {
  const [launchTarget, setLaunchTarget] = useState<LaunchTarget | null>(null);
  const [launchAgentId, setLaunchAgentId] = useState("");
  const [launchModel, setLaunchModel] = useState("");
  const [launchInitialPrompt, setLaunchInitialPrompt] = useState("");
  const [launchingProject, setLaunchingProject] = useState(false);
  const [launchError, setLaunchError] = useState("");

  const openLaunchModal = (project: ProjectState, preferredAgentId?: string) => {
    const savedAgentId = project.agentPref ?? preferredAgentId;
    const preferred =
      launchableAgents.find((entry) => entry.id === savedAgentId) ??
      launchableAgents.find((entry) => entry.id === selectedAgent) ??
      launchableAgents[0] ??
      null;
    if (!preferred) {
      setError("No launchable agents are configured.");
      return;
    }
    setLaunchTarget({ id: project.id, tab: project.tab, dir: project.dir });
    setLaunchAgentId(preferred.id);
    setLaunchModel(project.modelPref ?? preferred.defaultModel);
    setLaunchInitialPrompt("");
    setLaunchError("");
  };

  const confirmLaunch = async () => {
    if (!launchTarget) return;
    setLaunchingProject(true);
    setLaunchError("");
    try {
      await launchProject(
        launchTarget.tab,
        launchTarget.dir,
        launchAgentId,
        launchModel.trim() || undefined,
        launchInitialPrompt.trim() || undefined,
      );
      if (launchTarget.id) {
        patchJson(`/api/user-projects/${launchTarget.id}`, {
          agentPref: launchAgentId,
          modelPref: launchModel.trim() || undefined,
        }).catch(() => {});
      }
      setLaunchTarget(null);
    } catch (e) {
      setLaunchError(e instanceof Error ? e.message : "Failed to launch project");
    } finally {
      setLaunchingProject(false);
    }
  };

  return {
    launchTarget,
    launchAgentId,
    launchModel,
    launchInitialPrompt,
    launchingProject,
    launchError,
    setLaunchTarget,
    setLaunchAgentId,
    setLaunchModel,
    setLaunchInitialPrompt,
    openLaunchModal,
    confirmLaunch,
  };
}
