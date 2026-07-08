"use client";

import { useState } from "react";
import { Archive, FolderX, Loader2, Trash2 } from "lucide-react";
import { deleteJson, throwApiError } from "@/lib/api/fetch";

export function ProjectTeardown({
  projectId,
  hasRepo,
  hasLocalPath,
  onDeleted,
}: {
  projectId: string;
  hasRepo: boolean;
  hasLocalPath: boolean;
  onDeleted: () => void;
}) {
  const [deprovision, setDeprovision] = useState<"none" | "archive-repo" | "delete-repo">("none");
  const [deleteLocal, setDeleteLocal] = useState(false);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function destroy() {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (deprovision !== "none") params.set("deprovision", deprovision);
      if (deleteLocal) params.set("deleteLocal", "1");
      const res = await deleteJson(`/api/projects/${projectId}${params.size ? `?${params}` : ""}`);
      if (!res.ok) await throwApiError(res, "Failed to delete project");
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete project");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="ui-project-drawer-panel">
      <summary className="ui-project-drawer-panel-summary text-status-negative">
        <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Danger zone
      </summary>
      <div className="ui-project-drawer-panel-body space-y-3">
        <div className="space-y-2 text-xs text-text-secondary">
          {hasRepo && (
            <>
              <label className="flex items-center gap-2">
                <input type="radio" checked={deprovision === "none"} onChange={() => setDeprovision("none")} />
                Keep linked GitHub repository
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={deprovision === "archive-repo"} onChange={() => setDeprovision("archive-repo")} />
                <Archive className="h-3.5 w-3.5" aria-hidden="true" /> Archive GitHub repository
              </label>
              <label className="flex items-center gap-2 text-status-negative">
                <input type="radio" checked={deprovision === "delete-repo"} onChange={() => setDeprovision("delete-repo")} />
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete GitHub repository
              </label>
            </>
          )}
          {hasLocalPath && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={deleteLocal} onChange={(e) => setDeleteLocal(e.target.checked)} />
              <FolderX className="h-3.5 w-3.5" aria-hidden="true" /> Delete local checkout under dev root
            </label>
          )}
        </div>

        {armed ? (
          <div className="flex items-center gap-2">
            <button type="button" onClick={destroy} disabled={busy} className="ui-btn-danger gap-1.5">
              {busy ? <Loader2 className="ui-spinner-xs" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete project
            </button>
            <button type="button" onClick={() => { setArmed(false); setError(null); }} className="ui-btn-text-cancel">Cancel</button>
          </div>
        ) : (
          <button type="button" onClick={() => setArmed(true)} className="ui-btn-danger gap-1.5">
            <Trash2 className="h-3.5 w-3.5" /> Delete project
          </button>
        )}
        {error && <p className="ui-error-xs">{error}</p>}
      </div>
    </details>
  );
}
