"use client";

import { useState, useEffect } from "react";
import { Loader2, Pencil, Save, Trash2, Terminal, X } from "lucide-react";
import { getJson } from "@/lib/api/fetch";
import type { SessionData } from "@/app/api/sessions/route";
import { setAttr, removeAttr } from "@/lib/api/attrs";
import { buildSessionHandoffFromBeaconSession, SessionHandoff } from "@/components/control/SessionHandoff";

export function AddAttrInline({
  projectId,
  presetKey,
  presetPlaceholder,
  initialValue,
  onSaved,
  onCancel,
}: {
  projectId: string;
  presetKey?: string;
  presetPlaceholder?: string;
  initialValue?: string;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [key, setKey] = useState(presetKey ?? "");
  const [value, setValue] = useState(initialValue ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!key.trim() || !value.trim() || saving) return;
    setSaving(true);
    await setAttr(`/api/projects/${projectId}`, key, value);
    setSaving(false);
    setValue("");
    if (!presetKey) setKey("");
    onSaved();
  };

  return (
    <div className="flex gap-2 items-center">
      {!presetKey && (
        <input
          placeholder="key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="ui-input-inline border-border-subtle w-24 px-2 py-1.5 text-xs text-text-secondary placeholder:text-text-muted"
        />
      )}
      <input
        placeholder={presetPlaceholder ?? "value"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") onCancel?.(); }}
        autoFocus
        className="ui-input-inline border-border-subtle flex-1 px-2 py-1.5 text-xs text-text-secondary placeholder:text-text-muted"
      />
      {onCancel && (
        <button onClick={onCancel} className="ui-btn-inline-cancel">
          <X className="h-3 w-3" />
        </button>
      )}
      <button
        onClick={save}
        disabled={!key.trim() || !value.trim() || saving}
        className="ui-btn-confirm-icon shrink-0"
      >
        {saving ? <Loader2 className="ui-spinner-xs" /> : <Save className="h-3 w-3" />}
      </button>
    </div>
  );
}

export function AttrRow({
  label,
  value,
  projectId,
  attrKey,
  onReload,
  placeholder,
}: {
  label: string;
  value: string;
  projectId: string;
  attrKey: string;
  onReload: () => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const deleteAttr = async () => {
    setDeleting(true);
    try {
      await removeAttr(`/api/projects/${projectId}`, attrKey);
      onReload();
    } finally {
      setDeleting(false);
    }
  };

  if (editing) {
    return (
      <div className="py-1">
        <div className="ui-micro-label mb-1">{label}</div>
        <AddAttrInline
          projectId={projectId}
          presetKey={attrKey}
          presetPlaceholder={placeholder ?? label}
          initialValue={value}
          onSaved={() => { setEditing(false); onReload(); }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const isUrl = value.startsWith("http");
  return (
    <div className="group flex items-start gap-3 py-2 border-b border-border-subtle last:border-0">
      <span className="ui-micro-label w-24 shrink-0 pt-0.5 leading-relaxed">{label}</span>
      <div className="flex-1 min-w-0 flex items-start gap-1.5">
        {isUrl ? (
          <a href={value} target="_blank" rel="noreferrer"
            className="text-xs text-text-secondary hover:text-text-primary underline underline-offset-2 break-all leading-relaxed">
            {value.replace(/^https?:\/\//, "")}
          </a>
        ) : (
          <span className="text-xs text-text-secondary leading-relaxed break-words">{value}</span>
        )}
        <button
          onClick={() => setEditing(true)}
          className="ui-hover-reveal ui-icon-btn p-1 rounded text-text-muted hover:text-text-secondary hover:bg-surface-raised transition-all shrink-0 mt-0.5"
          title="Edit"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          onClick={deleteAttr}
          disabled={deleting}
          className="ui-hover-reveal ui-icon-btn p-1 rounded text-text-muted hover:text-status-negative hover:bg-surface-raised transition-all shrink-0 mt-0.5 disabled:opacity-30"
          title="Delete attribute"
        >
          {deleting ? <Loader2 className="ui-spinner-xs" /> : <Trash2 className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
}

export function ClaudeSession({ tabName }: { tabName: string }) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    getJson<SessionData>(`/api/sessions?project=${encodeURIComponent(tabName)}`)
      .then((d) => setSession(d))
      .catch(() => {});
  }, [tabName]);

  if (!session || !session.found) return null;

  return (
    <div className="ui-panel overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle/50">
        <div className="flex items-center gap-2 text-text-secondary">
          <Terminal className="h-3.5 w-3.5" />
          <span className="text-sm font-medium">Latest agent handoff</span>
        </div>
        <button
          onClick={() => setShowRaw((v) => !v)}
          className="ui-link-muted"
        >
          {showRaw ? "Structured" : "Raw"}
        </button>
      </div>

      {showRaw ? (
        <pre className="px-4 py-3 text-xs text-text-secondary leading-relaxed whitespace-pre-wrap break-words font-mono">
          {session.raw}
        </pre>
      ) : (
        <div className="p-4">
          <SessionHandoff
            data={buildSessionHandoffFromBeaconSession({
              next: session.next ? [session.next] : [],
              in_progress: [],
              done: session.done ? [session.done] : [],
              tests: session.tests,
              todos: session.todos,
              health: session.health,
            })}
            surface="plain"
            microLabels
          />
        </div>
      )}
    </div>
  );
}
