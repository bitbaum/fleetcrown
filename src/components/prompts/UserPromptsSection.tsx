"use client";

// User-owned prompts section on /prompts. Renders ABOVE the FleetCrown
// defaults so the user's own prompts are first-class — they grow over
// time as the user works and become more relevant than the seed catalog.
//
// v2.1a (this file): list + create. v2.1b adds edit + delete on each card.
// v2.2 adds the variables modal for {{name}} placeholders at run time.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, X, Pencil, Trash2 } from "lucide-react";
import type { Project } from "./types";

export interface UserPromptCard {
  id: string;
  name: string;
  description: string;
  body: string;
  scope: "global" | "project" | "org";
  projectId: string | null;
  orgId: string | null;
  tags: string[];
  source: string;
  forkedFromKey: string | null;
  runCount: number;
  successCount: number;
  updatedAt: string;
}

export function UserPromptsSection({
  prompts,
  projects,
}: {
  prompts: UserPromptCard[];
  projects: Project[];
}) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleDelete(id: string) {
    if (!confirm("Soft-delete this prompt? It will be hidden but can be restored from DB if needed.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/prompts/${id}`, { method: "DELETE" });
      if (res.ok) startTransition(() => router.refresh());
    } finally {
      setDeletingId(null);
    }
  }

  const editingPrompt = editingId ? prompts.find((p) => p.id === editingId) ?? null : null;

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="ui-page-subtitle">Your prompts</h2>
          <p className="text-sm text-text-muted">
            {prompts.length === 0
              ? "Build your own library. Project-pinned or global — your call."
              : `${prompts.length} saved · most-recent first`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setEditingId(null); setIsCreating(true); }}
          className="ui-btn-primary inline-flex items-center gap-1.5 text-sm"
        >
          <Plus className="h-3.5 w-3.5" />
          New prompt
        </button>
      </header>

      {(isCreating || editingPrompt) && (
        <PromptForm
          initial={editingPrompt}
          projects={projects}
          onCancel={() => { setIsCreating(false); setEditingId(null); }}
          onSaved={() => {
            setIsCreating(false);
            setEditingId(null);
            startTransition(() => router.refresh());
          }}
        />
      )}

      {prompts.length === 0 && !isCreating && (
        <div className="ui-card-shell p-6 text-center text-sm text-text-muted">
          No prompts yet. Click <em>New prompt</em> to add one, or fork a FleetCrown default below.
        </div>
      )}

      {prompts.length > 0 && (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {prompts.map((p) => {
            const projectName = p.projectId
              ? projects.find((pr) => pr.id === p.projectId)?.name ?? "(deleted project)"
              : null;
            return (
              <article
                key={p.id}
                className="ui-card-shell-raised p-4 flex flex-col gap-2 hover:border-accent transition-colors"
              >
                <header className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-text-primary truncate">{p.name}</h3>
                    {p.description && (
                      <p className="text-xs text-text-muted line-clamp-2 mt-0.5">{p.description}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => { setIsCreating(false); setEditingId(p.id); }}
                      className="ui-btn-icon"
                      aria-label="Edit prompt"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id)}
                      disabled={deletingId === p.id || isPending}
                      className="ui-btn-icon text-text-tertiary hover:text-status-warning disabled:opacity-40"
                      aria-label="Delete prompt"
                      title="Delete"
                    >
                      {deletingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </header>

                <div className="flex flex-wrap gap-1.5 text-micro">
                  <span className="ui-tag">{p.scope}</span>
                  {projectName && <span className="ui-tag" title="Pinned to project">{projectName}</span>}
                  {p.runCount > 0 && (
                    <span className="ui-tag" title={`${p.successCount} of ${p.runCount} runs succeeded`}>
                      {p.runCount > 0 ? `${Math.round((p.successCount / p.runCount) * 100)}% · ${p.runCount} runs` : null}
                    </span>
                  )}
                  {p.tags.slice(0, 3).map((t) => (
                    <span key={t} className="ui-tag">{t}</span>
                  ))}
                </div>

                <pre className="text-xs text-text-secondary bg-surface-base px-3 py-2 rounded-md whitespace-pre-wrap line-clamp-4 max-h-24 overflow-hidden">
                  {p.body}
                </pre>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── Inline create / edit form ────────────────────────────────────────────────

function PromptForm({
  initial,
  projects,
  onCancel,
  onSaved,
}: {
  initial: UserPromptCard | null;
  projects: Project[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const isEditing = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [scope, setScope] = useState<"global" | "project">(initial?.scope === "project" ? "project" : "global");
  const [projectId, setProjectId] = useState<string>(initial?.projectId ?? "");
  const [tagsInput, setTagsInput] = useState((initial?.tags ?? []).join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!name.trim() || !body.trim()) {
      setError("Name and body are both required.");
      return;
    }
    if (scope === "project" && !projectId) {
      setError("Pick a project to pin to, or switch to global.");
      return;
    }
    setSaving(true);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const body_ = {
        name: name.trim(),
        description: description.trim() || null,
        body: body.trim(),
        scope,
        projectId: scope === "project" ? projectId : null,
        tags,
      };
      const url = isEditing ? `/api/prompts/${initial!.id}` : "/api/prompts";
      const method = isEditing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body_),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error ?? `HTTP ${res.status}`);
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ui-card-shell-raised p-5 space-y-3">
      <header className="flex items-center justify-between">
        <h3 className="font-medium text-text-primary">
          {isEditing ? "Edit prompt" : "New prompt"}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="ui-btn-icon"
          aria-label="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="space-y-2">
        <label className="ui-kicker">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Daily code review"
          className="ui-input"
        />
      </div>

      <div className="space-y-2">
        <label className="ui-kicker">Description <span className="text-text-tertiary">(optional)</span></label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="One line about what this prompt does"
          className="ui-input"
        />
      </div>

      <div className="space-y-2">
        <label className="ui-kicker">Body</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="The prompt the agent will receive. Use {{name}} or {{name|default}} for variables."
          rows={8}
          className="ui-input font-mono text-sm"
        />
        <p className="text-xs text-text-muted">
          Variables: <code>{`{{var_name}}`}</code> or <code>{`{{var_name|default value}}`}</code>. At run time the UI will prompt for each.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="ui-kicker">Scope</label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as "global" | "project")}
            className="ui-input"
          >
            <option value="global">Global (all my projects)</option>
            <option value="project">Pinned to one project</option>
          </select>
        </div>
        {scope === "project" && (
          <div className="space-y-2">
            <label className="ui-kicker">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="ui-input"
            >
              <option value="">— pick —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="ui-kicker">Tags <span className="text-text-tertiary">(comma-separated)</span></label>
        <input
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="e.g. testing, weekly, review"
          className="ui-input"
        />
      </div>

      {error && <p className="text-xs text-status-warning">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="ui-btn-primary inline-flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {isEditing ? "Save changes" : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="ui-btn-ghost"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
