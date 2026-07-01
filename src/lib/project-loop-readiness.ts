import type { AutoInjectMode } from "@/config/beacon";

export type LoopReadableProject = {
  dir?: string | null;
  dirPath?: string | null;
  readonly?: boolean;
  autoInjectModeOverride?: AutoInjectMode | null;
};

export type ProjectLoopReadiness =
  | {
      state: "ready";
      label: "Loop-ready";
      tone: "positive";
      reason: "has_path";
      description: string;
    }
  | {
      state: "blocked";
      label: "Needs path";
      tone: "warning";
      reason: "no_path";
      description: string;
    }
  | {
      state: "paused";
      label: "Loop paused";
      tone: "warning";
      reason: "project_paused" | "fleet_paused";
      description: string;
    };

export function projectExecutionPath(project: LoopReadableProject): string | null {
  const path = project.dirPath ?? project.dir ?? null;
  const trimmed = path?.trim();
  return trimmed ? trimmed : null;
}

export function deriveProjectLoopReadiness(
  project: LoopReadableProject,
  inheritedMode: AutoInjectMode = "on",
): ProjectLoopReadiness {
  if (!projectExecutionPath(project)) {
    return {
      state: "blocked",
      label: "Needs path",
      tone: "warning",
      reason: "no_path",
      description: "Add a local path before FleetCrown can dispatch agent loops for this project.",
    };
  }

  if (project.autoInjectModeOverride === "off") {
    return {
      state: "paused",
      label: "Loop paused",
      tone: "warning",
      reason: "project_paused",
      description: "Automatic continuation is paused for this project.",
    };
  }

  if (inheritedMode === "off") {
    return {
      state: "paused",
      label: "Loop paused",
      tone: "warning",
      reason: "fleet_paused",
      description: "Fleet autopilot is paused globally.",
    };
  }

  return {
    state: "ready",
    label: "Loop-ready",
    tone: "positive",
    reason: "has_path",
    description: "This project has an execution path and can receive loop dispatches when a builder is connected.",
  };
}
