"use client";

import { useState } from "react";
import { postJson, throwApiError } from "@/lib/api/fetch";
import type { ProjectState } from "@/lib/control-types";

export function useCreateProject({
  openLaunchModal,
  refresh,
}: {
  openLaunchModal: (project: ProjectState) => void;
  refresh: (force?: boolean) => Promise<void>;
}) {
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDir, setNewDir] = useState("");
  const [newGitUrl, setNewGitUrl] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [createError, setCreateError] = useState("");

  const createAndLaunch = async () => {
    if (!newName.trim()) return;
    setCreatingProject(true);
    setCreateError("");
    try {
      const res = await postJson("/api/user-projects", {
        name: newName.trim(),
        dirPath: newDir.trim() || undefined,
        gitUrl: newGitUrl.trim() || undefined,
      });
      if (!res.ok) await throwApiError(res, "Failed to create project");
      const newProject = await res.json().catch(() => null);
      setNewProjectOpen(false);
      if (newDir.trim()) {
        openLaunchModal({
          id: newProject?.id ?? null,
          projectId: newProject?.entityProjectId ?? null,
          tab: newName.trim(),
          dir: newDir.trim(),
          agentPref: null,
          modelPref: null,
        } as ProjectState);
      }
      setNewName("");
      setNewDir("");
      setNewGitUrl("");
      await refresh(true);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setCreatingProject(false);
    }
  };

  return {
    newProjectOpen,
    setNewProjectOpen,
    newName,
    setNewName,
    newDir,
    setNewDir,
    newGitUrl,
    setNewGitUrl,
    creatingProject,
    createError,
    createAndLaunch,
  };
}
