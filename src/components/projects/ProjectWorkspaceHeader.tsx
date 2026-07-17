"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DescriptionEditor, MaturityEditor, StatusEditor } from "./ProjectInlineEditors";
import { patchJson } from "@/lib/api/fetch";
import { setAttr } from "@/lib/api/attrs";
import { rememberFleetProject } from "@/lib/fleet-context";

export function ProjectWorkspaceHeader({
  projectId,
  name,
  workspaceKey,
  description,
  status,
  maturity,
  readonly,
}: {
  projectId: string;
  name: string;
  workspaceKey: string;
  description: string | null;
  status: string | null;
  maturity: string | null;
  readonly: boolean;
}) {
  const router = useRouter();
  const [currentDescription, setCurrentDescription] = useState(description);
  const [currentStatus, setCurrentStatus] = useState(status);
  const [currentMaturity, setCurrentMaturity] = useState(maturity);

  useEffect(() => {
    rememberFleetProject(workspaceKey);
  }, [workspaceKey]);

  const refresh = () => router.refresh();

  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <StatusEditor
          value={currentStatus}
          editable={!readonly}
          onSave={async (next) => {
            const response = await setAttr(`/api/projects/${projectId}`, "status", next);
            if (!response.ok) throw new Error("Failed to save status");
            setCurrentStatus(next);
            refresh();
          }}
        />
        <MaturityEditor
          value={currentMaturity}
          editable={!readonly}
          onSave={async (next) => {
            const response = await setAttr(`/api/projects/${projectId}`, "maturity", next);
            if (!response.ok) throw new Error("Failed to save maturity");
            setCurrentMaturity(next);
            refresh();
          }}
        />
        {readonly && <span className="ui-tag ui-tag-neutral">Team project</span>}
      </div>

      <div className="mt-3">
        <h1 className="break-words text-2xl font-semibold leading-tight text-text-primary sm:text-3xl">{name}</h1>
      </div>

      <div className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary sm:text-base">
        <DescriptionEditor
          value={currentDescription}
          editable={!readonly}
          size="lead"
          onSave={async (next) => {
            const response = await patchJson(`/api/projects/${projectId}`, { description: next });
            const body = (await response.json()) as { ok?: boolean; error?: string };
            if (!response.ok || !body.ok) throw new Error(body.error ?? "Failed to save description");
            setCurrentDescription(next || null);
            refresh();
          }}
        />
      </div>
    </div>
  );
}
