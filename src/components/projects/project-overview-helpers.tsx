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
          className="w-24 bg-surface-raised border border-border-subtle rounded px-2 py-1.5 text-xs text-text-secondary placeholder:text-text-muted focus:outline-none focus:border-border-strong"
        />
      )}
      <input
        placeholder={presetPlaceholder ?? "value"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") onCancel?.(); }}
        autoFocus
        className="flex-1 bg-surface-raised border border-border-subtle rounded px-2 py-1.5 text-xs text-text-secondary placeholder:text-text-muted focus:outline-none focus:border-border-strong"
      />
      {onCancel && (
        <button onClick={onCancel} className="p-1.5 rounded text-text-muted hover:text-text-secondary transition-colors shrink-0">
          <X className="h-3 w-3" />
        </button>
      )}
      <button
        onClick={save}
        disabled={!key.trim() || !value.trim() || saving}
        className="ui-btn-confirm p-1.5 rounded disabled:opacity-30 shrink-0 transition-colors"
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
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
        <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{label}</div>
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
      <span className="text-[10px] text-text-muted uppercase tracking-wider w-24 shrink-0 pt-0.5 leading-relaxed">{label}</span>
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
          className="sm:opacity-0 sm:group-hover:opacity-100 p-1 rounded text-text-muted hover:text-text-secondary hover:bg-surface-raised transition-all shrink-0 mt-0.5"
          title="Edit"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          onClick={deleteAttr}
          disabled={deleting}
          className="sm:opacity-0 sm:group-hover:opacity-100 p-1 rounded text-text-muted hover:text-status-negative hover:bg-surface-raised transition-all shrink-0 mt-0.5 disabled:opacity-30"
          title="Delete attribute"
        >
          {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
}
