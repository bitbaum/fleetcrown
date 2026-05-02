"use client";

import { useState } from "react";
import { Loader2, Trash2, Plus } from "lucide-react";
import type { UserProject } from "@/db/schema";

type Props = { projects: UserProject[] };

export function ProjectsSettings({ projects: initial }: Props) {
  const [projects, setProjects] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [dirPath, setDirPath] = useState("");
  const [gitUrl, setGitUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const add = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/user-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          dirPath: dirPath.trim() || undefined,
          gitUrl: gitUrl.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to add project");
      setProjects((p) => [...p, body]);
      setName("");
      setDirPath("");
      setGitUrl("");
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await fetch(`/api/user-projects/${id}`, { method: "DELETE" });
      setProjects((p) => p.filter((x) => x.id !== id));
    } catch {
      // network error — leave list unchanged
    }
  };

  return (
    <section className="ui-panel p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-text-primary">Projects</h2>
        <button onClick={() => setAdding((v) => !v)} className="ui-btn-secondary py-1.5 text-xs gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>

      {adding && (
        <div className="ui-panel-raised p-4 space-y-3">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Project name"
            className="ui-input"
          />
          <input
            value={dirPath}
            onChange={(e) => setDirPath(e.target.value)}
            placeholder="Local path — optional"
            className="ui-input"
          />
          <input
            value={gitUrl}
            onChange={(e) => setGitUrl(e.target.value)}
            placeholder="GitHub URL — optional"
            className="ui-input"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)} className="ui-btn-ghost">
              Cancel
            </button>
            <button
              onClick={add}
              disabled={saving || !name.trim()}
              className="ui-btn-primary"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Add project
            </button>
          </div>
        </div>
      )}

      {projects.length === 0 ? (
        <p className="text-sm text-text-muted">No projects yet.</p>
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface-raised px-4 py-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-text-primary truncate">{p.name}</div>
                {p.dirPath && (
                  <div className="text-xs text-text-muted truncate font-mono">{p.dirPath}</div>
                )}
                {p.gitUrl && (
                  <div className="text-xs text-text-muted truncate">{p.gitUrl}</div>
                )}
              </div>
              <button
                onClick={() => remove(p.id)}
                className="ui-btn-ghost shrink-0 p-1.5 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
