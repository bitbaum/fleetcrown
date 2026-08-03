"use client";

// One-click provisioning: turn a registered idea into a real, dispatchable
// project. Creates the GitHub repo (seeded starter), links it, and sets the
// dir path the runner clones into — so it appears in Control. No `gh`, no
// `~/dev`, no terminal. Shown only while a project has no repo linked yet.

import { useState } from "react";
import { Loader2, Rocket, GitBranch } from "lucide-react";
import { postJson } from "@/lib/api/fetch";
import { DEFAULT_PROVISION_TEMPLATE, PROVISION_TEMPLATES } from "@/config/project-templates";

type Done = { repo: { full_name: string; gitUrl: string }; dirPath: string };

export function ProjectProvision({ projectId, onReload }: { projectId: string; onReload: () => void }) {
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<string>(DEFAULT_PROVISION_TEMPLATE);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  async function provision() {
    setBusy(true);
    setError(null);
    try {
      const res = await postJson(`/api/projects/${projectId}/provision`, { template, visibility });
      const json = (await res.json()) as { ok?: boolean; repo?: Done["repo"]; dirPath?: string; error?: string };
      if (!res.ok || !json.ok) { setError(json.error ?? `HTTP ${res.status}`); return; }
      setDone({ repo: json.repo!, dirPath: json.dirPath! });
      setOpen(false);
      onReload();
    } catch { setError("Network error — try again"); }
    finally { setBusy(false); }
  }

  if (done) {
    return (
      <p className="text-xs text-status-positive inline-flex items-center gap-1.5">
        <GitBranch className="h-3.5 w-3.5" />
        Provisioned <a href={done.repo.gitUrl} target="_blank" rel="noreferrer" className="underline">{done.repo.full_name}</a> — now in Control, ready to dispatch.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {!open ? (
        <button
          onClick={() => { setOpen(true); setError(null); }}
          className="ui-btn-chip gap-1.5 px-3 py-1.5 text-xs"
          title="Create the GitHub repo + starter, link it, and make this project dispatchable in Control — no terminal needed."
        >
          <Rocket className="h-3.5 w-3.5 text-accent-text" />
          Provision repo &amp; set up
        </button>
      ) : (
        <div className="space-y-2 rounded-lg border border-border-subtle bg-surface-raised p-3">
          <p className="text-xs text-text-secondary">Creates a GitHub repo, seeds a starter, and links it so this project is dispatchable in Control.</p>
          <div className="flex flex-wrap items-center gap-2">
            <select className="ui-input-compact" value={template} onChange={(e) => setTemplate(e.target.value)} aria-label="Starter template">
              {PROVISION_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <select className="ui-input-compact" value={visibility} onChange={(e) => setVisibility(e.target.value as "private" | "public")} aria-label="Repo visibility">
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={provision} disabled={busy} className="ui-btn-save gap-1.5">
              {busy ? <Loader2 className="ui-spinner-xs" /> : <Rocket className="h-3.5 w-3.5" />}
              Provision
            </button>
            <button onClick={() => setOpen(false)} disabled={busy} className="ui-btn-text-cancel">Cancel</button>
          </div>
        </div>
      )}
      {error && <p className="ui-error-xs">{error}</p>}
    </div>
  );
}
