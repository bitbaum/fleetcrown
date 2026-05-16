"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { Loader2, History, StickyNote, Trash2 } from "lucide-react";
import { patchJson, deleteJson, throwApiError } from "@/lib/api/fetch";
import { setAttr } from "@/lib/api/attrs";
import type { DevLogEntry, UserProject } from "@/db/schema/user-projects";
import { DevLogList } from "@/components/shared/DevLogList";
import { CollapsibleSection } from "./project-profile-sections";

export function NotesSection({ projectId, project }: { projectId: string; project: UserProject | null }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const value = draft ?? project?.notes ?? "";

  const persist = useCallback(async (text: string) => {
    setSaving(true);
    try {
      await patchJson(`/api/user-projects/${projectId}`, { notes: text || undefined });
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  }, [projectId]);

  const handleChange = (text: string) => {
    setDraft(text);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(text), 900);
  };

  const handleBlur = () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    if (draft !== null) persist(draft);
  };

  if (!project) return null;

  return (
    <CollapsibleSection
      title="Notes"
      icon={<StickyNote className="h-3.5 w-3.5 text-text-muted" />}
      badge={project.notes ? <span className="h-1.5 w-1.5 rounded-full bg-accent-text/50" /> : undefined}
      trailing={saving ? <Loader2 className="h-3 w-3 animate-spin text-text-muted" /> : undefined}
    >
      <textarea
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        placeholder="Free-form notes, context, or reminders for this project…"
        rows={5}
        className="w-full resize-y rounded-xl border border-border-subtle bg-surface-base px-3.5 py-2.5 text-sm leading-relaxed text-text-primary placeholder:text-text-muted focus:border-accent-primary/50 focus:outline-none focus:ring-1 focus:ring-accent-primary/20"
      />
    </CollapsibleSection>
  );
}

export function DevLogSection({ entries }: { entries: DevLogEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <CollapsibleSection
      title="Dev Log"
      icon={<History className="h-3.5 w-3.5 text-text-muted" />}
      badge={<span className="ml-1 text-xs text-text-muted">({entries.length})</span>}
    >
      <DevLogList entries={entries} />
    </CollapsibleSection>
  );
}

export function QuickProfileForm({ projectId, onSaved }: { projectId: string; onSaved: () => void }) {
  const [mission, setMission] = useState("");
  const [stack, setStack] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasAny = mission.trim() || stack.trim() || url.trim();

  const handleSave = async () => {
    if (!hasAny || saving) return;
    setSaving(true);
    setError(null);
    try {
      const base = `/api/projects/${projectId}`;
      const results = await Promise.all([
        mission.trim() ? setAttr(base, "mission", mission.trim()) : null,
        stack.trim() ? setAttr(base, "stack", stack.trim()) : null,
        url.trim() ? setAttr(base, "url", url.trim()) : null,
      ]);
      if (results.some((r) => r !== null && !r.ok)) throw new Error("Save failed");
      onSaved();
    } catch {
      setError("Failed to save — try again");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 px-4 pb-5 pt-3 sm:px-5">
      <div className="space-y-2.5">
        <div>
          <p className="ui-kicker mb-1.5">Mission</p>
          <input
            autoFocus
            value={mission}
            onChange={(e) => setMission(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder="One sentence: what this project does and for whom"
            className="ui-input w-full"
          />
        </div>
        <div>
          <p className="ui-kicker mb-1.5">Stack</p>
          <input
            value={stack}
            onChange={(e) => setStack(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder="e.g. Next.js · TypeScript · PostgreSQL"
            className="ui-input w-full"
          />
        </div>
        <div>
          <p className="ui-kicker mb-1.5">URL</p>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder="https://…"
            className="ui-input w-full"
          />
        </div>
      </div>
      {error && <p className="ui-error-xs">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !hasAny}
          className="ui-btn-primary gap-1.5"
        >
          {saving ? <Loader2 className="ui-spinner-sm" /> : null}
          {saving ? "Saving…" : "Save profile"}
        </button>
        <Link
          href={`/projects?open=${projectId}`}
          className="text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          Full editor in Projects →
        </Link>
      </div>
    </div>
  );
}

export function RemoveSection({ projectId, onRemoved }: { projectId: string; onRemoved: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRemove = async () => {
    setRemoving(true);
    setError(null);
    try {
      const res = await deleteJson(`/api/user-projects/${projectId}`);
      if (!res.ok) await throwApiError(res, "Failed to remove");
      onRemoved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove");
      setRemoving(false);
    }
  };

  return (
    <div className="border-t border-border-subtle px-4 py-3 sm:px-5">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-text-tertiary">Remove from control panel?</span>
          <button
            onClick={handleRemove}
            disabled={removing}
            className="text-status-negative transition-colors hover:opacity-80 disabled:opacity-50"
          >
            {removing ? <Loader2 className="ui-spinner-xs" /> : "Remove"}
          </button>
          <button
            onClick={() => { setConfirming(false); setError(null); }}
            className="text-text-muted transition-colors hover:text-text-secondary"
          >
            Cancel
          </button>
          {error && <p className="ui-error-xs w-full">{error}</p>}
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="flex items-center gap-1.5 text-xs text-text-muted transition-colors hover:text-status-negative"
        >
          <Trash2 className="h-3 w-3" />
          Remove from control panel
        </button>
      )}
    </div>
  );
}
