"use client";

import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";
import { ProjectProvision } from "./ProjectProvision";
import { ProjectTeardown } from "./ProjectTeardown";

export function ProjectSettingsPanel({
  projectId,
  hasRepo,
  hasLocalPath,
}: {
  projectId: string;
  hasRepo: boolean;
  hasLocalPath: boolean;
}) {
  const router = useRouter();

  return (
    <details id="settings" className="scroll-mt-28 border-y border-border-subtle">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary">
        <Settings className="h-4 w-4" aria-hidden="true" /> Project settings
      </summary>
      <div className="space-y-5 border-t border-border-subtle py-5">
        {!hasRepo && <ProjectProvision projectId={projectId} onReload={() => router.refresh()} />}
        <ProjectTeardown
          projectId={projectId}
          hasRepo={hasRepo}
          hasLocalPath={hasLocalPath}
          onDeleted={() => router.push("/projects")}
        />
      </div>
    </details>
  );
}
