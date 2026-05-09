"use client";

import { useRef, useState } from "react";
import { Loader2, Trash2, Plus, GripVertical } from "lucide-react";
import { postJson, deleteJson, patchJson } from "@/lib/api/fetch";
import type { UserProject } from "@/db/schema";
import { cn } from "@/lib/utils";

type Props = { projects: UserProject[] };

export function ProjectsSettings({ projects: initial }: Props) {
  const [projects, setProjects] = useState(initial);
  const dragIndex = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
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
      const res = await postJson("/api/user-projects", {
        name: name.trim(),
        dirPath: dirPath.trim() || undefined,
        gitUrl: gitUrl.trim() || undefined,
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
    const res = await deleteJson(`/api/user-projects/${id}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      setError(body.error ?? "Failed to remove project");
      return;
    }
    setProjects((p) => p.filter((x) => x.id !== id));
  };

  const reorder = (from: number, to: number) => {
    if (from === to) return;
    setProjects((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      // Persist new positions fire-and-forget
      next.forEach((p, i) => {
        patchJson(`/api/user-projects/${p.id}`, { position: i }).catch(() => {});
      });
      return next;
    });
  };

  return (
    <section className="ui-settings-section">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-text-primary">Projects</h2>
        <button onClick={() => setAdding((v) => !v)} className="ui-btn-secondary py-1.5 text-xs gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>

      {adding && (
        <div className="ui-settings-subpanel">
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
          {error && <p className="text-sm text-status-negative">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)} className="ui-btn-ghost">
              Cancel
            </button>
            <button
              onClick={add}
              disabled={saving || !name.trim()}
              className="ui-btn-primary"
            >
              {saving && <Loader2 className="ui-spinner-sm" />}
              Add project
            </button>
          </div>
        </div>
      )}

      {error && !adding && <p className="text-sm text-status-negative">{error}</p>}

      {projects.length === 0 ? (
        <p className="text-sm text-text-secondary">No projects yet.</p>
      ) : (
        <ul className="space-y-2">
          {projects.map((p, i) => (
            <li
              key={p.id}
              draggable
              onDragStart={() => { dragIndex.current = i; }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
              onDrop={() => { if (dragIndex.current !== null && dragIndex.current !== i) reorder(dragIndex.current, i); dragIndex.current = null; setDragOver(null); }}
              onDragEnd={() => { setDragOver(null); dragIndex.current = null; }}
              className={cn("ui-list-item", dragOver === i && "bg-accent-primary/5")}
            >
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-text-muted/50 active:cursor-grabbing" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-text-primary truncate" title={p.name}>{p.name}</div>
                {p.dirPath && (
                  <div className="text-xs text-text-tertiary truncate font-mono" title={p.dirPath}>{p.dirPath}</div>
                )}
                {p.gitUrl && (
                  <div className="text-xs text-text-tertiary truncate" title={p.gitUrl}>{p.gitUrl}</div>
                )}
              </div>
              <button
                onClick={() => remove(p.id)}
                className="ui-btn-ghost shrink-0 p-1.5 hover:text-status-negative"
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
