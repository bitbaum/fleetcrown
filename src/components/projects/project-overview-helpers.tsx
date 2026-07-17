"use client";

import { useState } from "react";
import { Loader2, Pencil, Save, Trash2, X } from "lucide-react";
import { setAttr, removeAttr } from "@/lib/api/attrs";

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
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!key.trim() || !value.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await setAttr(`/api/projects/${projectId}`, key, value);
      if (!res.ok) throw new Error("Save failed");
      setValue("");
      if (!presetKey) setKey("");
      onSaved();
    } catch {
      setError("Failed to save — try again");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1.5">
      {error && <p className="ui-error-xs">{error}</p>}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {!presetKey && (
          <input
            placeholder="key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="ui-input-inline min-h-11 w-full border-border-subtle px-3 py-2 text-base text-text-secondary placeholder:text-text-muted sm:w-32 sm:text-sm"
          />
        )}
        <input
          placeholder={presetPlaceholder ?? "value"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") onCancel?.(); }}
          autoFocus
          className="ui-input-inline min-h-11 min-w-0 flex-1 border-border-subtle px-3 py-2 text-base text-text-secondary placeholder:text-text-muted sm:text-sm"
        />
        <div className="flex items-center justify-end gap-2">
          {onCancel && (
            <button onClick={onCancel} className="ui-icon-action min-h-11 min-w-11" aria-label="Cancel editing">
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={save}
            disabled={!key.trim() || !value.trim() || saving}
            className="ui-btn-primary min-h-11 shrink-0 px-4"
            aria-label="Save field"
          >
            {saving ? <Loader2 className="ui-spinner-sm" /> : <Save className="h-4 w-4" />}
          </button>
        </div>
      </div>
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
  editable = true,
}: {
  label: string;
  value: string;
  projectId: string;
  attrKey: string;
  onReload: () => void;
  placeholder?: string;
  editable?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const deleteAttr = async () => {
    setDeleting(true);
    try {
      const res = await removeAttr(`/api/projects/${projectId}`, attrKey);
      if (res.ok) onReload();
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
    <div className="group flex min-h-14 flex-col gap-1.5 border-b border-border-subtle py-3 last:border-0 sm:flex-row sm:gap-4">
      <span className="ui-micro-label shrink-0 pt-0.5 leading-relaxed sm:w-32">{label}</span>
      <div className="flex-1 min-w-0 flex items-start gap-1.5">
        {isUrl ? (
          <a href={value} target="_blank" rel="noreferrer"
            className="break-all text-sm leading-relaxed text-text-secondary underline underline-offset-2 hover:text-text-primary">
            {value.replace(/^https?:\/\//, "")}
          </a>
        ) : (
          <span className="break-words text-sm leading-relaxed text-text-secondary">{value}</span>
        )}
        {editable && (
          <>
            <button
              onClick={() => setEditing(true)}
              className="ui-icon-action -my-2 min-h-10 min-w-10 shrink-0 text-text-muted hover:text-text-secondary"
              title="Edit"
              aria-label={`Edit ${label}`}
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              onClick={deleteAttr}
              disabled={deleting}
              className="ui-icon-action -my-2 min-h-10 min-w-10 shrink-0 text-text-muted hover:text-status-negative disabled:opacity-30"
              title="Delete attribute"
              aria-label={`Delete ${label}`}
            >
              {deleting ? <Loader2 className="ui-spinner-xs" /> : <Trash2 className="h-3 w-3" />}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
